import { DescribeSObjectResult, Field, PicklistEntry } from 'jsforce';
import fs from 'fs/promises';
import path from 'path';

type SalesforceType = string;
type PostgresType = string;

const typeMap: Record<SalesforceType, PostgresType> = {
  string: 'TEXT',
  textarea: 'TEXT',
  boolean: 'BOOLEAN',
  double: 'NUMERIC',
  currency: 'NUMERIC',
  date: 'DATE',
  datetime: 'TIMESTAMP',
  email: 'TEXT',
  phone: 'TEXT',
  url: 'TEXT',
  reference: 'UUID',
};

function removeSuffix(name: string): string {
  return name.endsWith('__c') ? name.slice(0, -3) : name;
}

function convertFieldType(field: Field): PostgresType {
  if (
    field.type === 'picklist' &&
    field.picklistValues &&
    field.picklistValues.length === 2
  ) {
    return 'BOOLEAN';
  }
  return typeMap[field.type as SalesforceType] || 'TEXT';
}

export function generateDDL(
  objectName: string,
  metadata: DescribeSObjectResult,
  allObjects: string[]
): string {
  const tableName = removeSuffix(objectName.toLowerCase());
  let ddl = `CREATE TABLE ${tableName} (\n`;
  ddl += '  id UUID PRIMARY KEY,\n';

  metadata.fields.forEach((field: Field) => {
    const columnName = removeSuffix(field.name.toLowerCase());
    if (
      field.type === 'picklist' &&
      field.picklistValues &&
      field.picklistValues.length > 2
    ) {
      ddl += `  ${columnName}_id INTEGER,\n`;
    } else if (field.type !== 'multipicklist') {
      ddl += `  ${columnName} ${convertFieldType(field)}`;
      if (
        field.type === 'reference' &&
        field.referenceTo &&
        field.referenceTo.length > 0
      ) {
        const referenceObject = field.referenceTo[0];
        if (allObjects.includes(referenceObject)) {
          ddl += ` REFERENCES ${removeSuffix(
            referenceObject.toLowerCase()
          )}(id)`;
        }
      }
      ddl += ',\n';
    }
  });

  ddl = ddl.slice(0, -2); // Remove the last comma and newline
  ddl += '\n);\n\n';

  // Generate tables for picklists and multipicklists
  metadata.fields.forEach((field: Field) => {
    if (
      (field.type === 'picklist' || field.type === 'multipicklist') &&
      field.picklistValues &&
      field.picklistValues.length > 2
    ) {
      const picklistTableName = `${tableName}_${removeSuffix(
        field.name.toLowerCase()
      )}`;
      ddl += `CREATE TABLE ${picklistTableName} (\n`;
      ddl += '  id SERIAL PRIMARY KEY,\n';
      ddl += '  value TEXT NOT NULL UNIQUE\n';
      ddl += ');\n\n';

      if (field.type === 'picklist') {
        ddl += `ALTER TABLE ${tableName} ADD CONSTRAINT fk_${tableName}_${removeSuffix(
          field.name.toLowerCase()
        )} `;
        ddl += `FOREIGN KEY (${removeSuffix(
          field.name.toLowerCase()
        )}_id) REFERENCES ${picklistTableName}(id);\n\n`;
      } else if (field.type === 'multipicklist') {
        const junctionTableName = `${tableName}_${removeSuffix(
          field.name.toLowerCase()
        )}_junction`;
        ddl += `CREATE TABLE ${junctionTableName} (\n`;
        ddl += `  ${tableName}_id UUID REFERENCES ${tableName}(id),\n`;
        ddl += `  ${removeSuffix(
          field.name.toLowerCase()
        )}_id INTEGER REFERENCES ${picklistTableName}(id),\n`;
        ddl += `  PRIMARY KEY (${tableName}_id, ${removeSuffix(
          field.name.toLowerCase()
        )}_id)\n`;
        ddl += ');\n\n';
      }
    }
  });

  return ddl;
}

export function generatePicklistDDL(
  objectName: string,
  metadata: DescribeSObjectResult
): string {
  let ddl = '';

  metadata.fields.forEach((field: Field) => {
    if (
      (field.type === 'picklist' || field.type === 'multipicklist') &&
      field.picklistValues &&
      field.picklistValues.length > 2
    ) {
      const tableName = `${removeSuffix(
        objectName.toLowerCase()
      )}_${removeSuffix(field.name.toLowerCase())}`;

      field.picklistValues.forEach((picklistEntry: PicklistEntry, index) => {
        ddl += `INSERT INTO ${tableName} (id, value) VALUES (${index + 1}, '${
          picklistEntry.value
        }');\n`;
      });

      ddl += '\n';
    }
  });

  return ddl;
}

async function getCurrentPicklistValues(
  objectName: string,
  fieldName: string
): Promise<Set<string>> {
  const filePath = path.join(
    process.cwd(),
    'outputs',
    objectName,
    `${objectName.toLowerCase()}_picklist.sql`
  );
  const currentValues = new Set<string>();

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const tableName = `${removeSuffix(objectName.toLowerCase())}_${removeSuffix(
      fieldName.toLowerCase()
    )}`;

    lines.forEach(line => {
      if (line.startsWith(`INSERT INTO ${tableName}`)) {
        const match = line.match(/VALUES \(\d+, '(.+)'\)/);
        if (match) {
          currentValues.add(match[1]);
        }
      }
    });
  } catch (error) {}

  return currentValues;
}

export async function generatePicklistUpdates(
  objectName: string,
  metadata: DescribeSObjectResult
): Promise<string> {
  let updates = '';

  for (const field of metadata.fields) {
    if (
      (field.type === 'picklist' || field.type === 'multipicklist') &&
      field.picklistValues &&
      field.picklistValues.length > 2
    ) {
      const tableName = `${removeSuffix(
        objectName.toLowerCase()
      )}_${removeSuffix(field.name.toLowerCase())}`;

      // Get current picklist values from the existing picklist file
      const currentValues = await getCurrentPicklistValues(
        objectName,
        field.name
      );

      // Generate INSERT statements for new values
      field.picklistValues.forEach((picklistEntry: PicklistEntry) => {
        if (!currentValues.has(picklistEntry.value)) {
          updates += `INSERT INTO ${tableName} (value) VALUES ('${picklistEntry.value}') ON CONFLICT (value) DO NOTHING;\n`;
        }
      });

      // Generate DELETE statements for removed values
      currentValues.forEach(value => {
        if (
          field.picklistValues &&
          !field.picklistValues.some(entry => entry.value === value)
        ) {
          updates += `DELETE FROM ${tableName} WHERE value = '${value}';\n`;
        }
      });

      updates += '\n';
    }
  }

  return updates;
}

export function generateObjectMarkdown(
  objectName: string,
  metadata: DescribeSObjectResult,
  allObjects: string[]
): string {
  let markdown = `# ${objectName}\n\n`;

  markdown += `## Attributes\n\n`;
  markdown += `| Field Name | Type | Description | Reference |\n`;
  markdown += `|------------|------|-------------|----------|\n`;

  metadata.fields.forEach((field: Field) => {
    let type = convertFieldType(field);
    let reference = '';
    const fieldName = removeSuffix(field.name);

    if (
      field.type === 'picklist' &&
      field.picklistValues &&
      field.picklistValues.length > 2
    ) {
      type = `Picklist (see below)`;
    } else if (
      field.type === 'multipicklist' &&
      field.picklistValues &&
      field.picklistValues.length > 2
    ) {
      type = `Multipicklist (see below)`;
    } else if (
      field.type === 'reference' &&
      field.referenceTo &&
      field.referenceTo.length > 0
    ) {
      const referenceObject = field.referenceTo[0];
      if (allObjects.includes(referenceObject)) {
        reference = `[${referenceObject}](../${removeSuffix(
          referenceObject.toLowerCase()
        )}/${removeSuffix(referenceObject.toLowerCase())}.md)`;
      }
    }

    markdown += `| ${fieldName} | ${type} | ${field.label} | ${reference} |\n`;
  });

  markdown += `\n## Picklists\n\n`;
  metadata.fields.forEach((field: Field) => {
    if (
      (field.type === 'picklist' || field.type === 'multipicklist') &&
      field.picklistValues &&
      field.picklistValues.length > 2
    ) {
      markdown += `### ${removeSuffix(field.name)}\n\n`;
      markdown += `| Value | Label |\n`;
      markdown += `|-------|-------|\n`;
      field.picklistValues.forEach((picklistEntry: PicklistEntry, index) => {
        markdown += `| ${index + 1} | ${picklistEntry.label} |\n`;
      });
      markdown += `\n`;
    }
  });

  return markdown;
}

export async function updateMainReadme(
  processedObjects: string[]
): Promise<void> {
  const readmePath = path.join(process.cwd(), 'README.md');
  let readmeContent = await fs.readFile(readmePath, 'utf-8');

  let tableContent = '| Salesforce Object | PostgreSQL Tables |\n';
  tableContent += '|-------------------|-------------------|\n';

  for (const objectName of processedObjects) {
    const metadata = JSON.parse(
      await fs.readFile(
        path.join(
          process.cwd(),
          'outputs',
          objectName,
          `${objectName.toLowerCase()}_metadata.json`
        ),
        'utf-8'
      )
    );
    const tableName = removeSuffix(objectName.toLowerCase());
    tableContent += `| ${objectName} | ${tableName} |\n`;

    metadata.fields.forEach((field: Field) => {
      if (
        (field.type === 'picklist' || field.type === 'multipicklist') &&
        field.picklistValues &&
        field.picklistValues.length > 2
      ) {
        const picklistTableName = `${tableName}_${removeSuffix(
          field.name.toLowerCase()
        )}`;
        tableContent += `|                   | ${picklistTableName} |\n`;
        if (field.type === 'multipicklist') {
          tableContent += `|                   | ${picklistTableName}_junction |\n`;
        }
      }
    });
  }

  // Replace the existing table in the README
  const tableRegex = /## Generated Tables\n\n[\s\S]*?\n\n/;
  const updatedReadmeContent = readmeContent.replace(
    tableRegex,
    `## Generated Tables\n\n${tableContent}\n\n`
  );

  await fs.writeFile(readmePath, updatedReadmeContent);
}
