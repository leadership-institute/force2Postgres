import fs from 'fs/promises';
import path from 'path';
import { DescribeSObjectResult, Field } from 'jsforce';

interface PostgresColumn {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: string;
}

interface PostgresTable {
  name: string;
  columns: PostgresColumn[];
}

function removeSuffix(name: string): string {
  return name.endsWith('__c') ? name.slice(0, -3) : name;
}

export async function readLocalTableDefinition(
  objectName: string
): Promise<PostgresTable | null> {
  const filePath = path.join(
    process.cwd(),
    'outputs',
    objectName.toLowerCase(),
    `create.sql`
  );
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseCreateTableStatement(content);
  } catch (error) {
    return null;
  }
}

function parseCreateTableStatement(sql: string): PostgresTable {
  // This is a simplified parser. You might want to use a proper SQL parser for more complex scenarios.
  const lines = sql.split('\n');
  const tableName = lines[0].match(/CREATE TABLE (\w+)/)?.[1] ?? '';
  const columns: PostgresColumn[] = [];

  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line.startsWith(')')) break;

    const [name, ...rest] = line.split(' ');
    const type = rest[0];
    const isPrimaryKey = line.includes('PRIMARY KEY');
    const isForeignKey = line.includes('REFERENCES');
    const references = line.match(/REFERENCES (\w+)/)?.[1];

    columns.push({ name, type, isPrimaryKey, isForeignKey, references });
  }

  return { name: tableName, columns };
}

function convertSalesforceTypeToPostgres(field: Field): string {
  const typeMap: { [key: string]: string } = {
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

  if (
    field.type === 'picklist' &&
    field.picklistValues &&
    field.picklistValues.length === 2
  ) {
    return 'BOOLEAN';
  }

  return typeMap[field.type] || 'TEXT';
}
export function generateAlterTableStatements(
  objectName: string,
  sfMetadata: DescribeSObjectResult,
  localTable: PostgresTable | null,
  allObjects: string[]
): string {
  let sql = '';

  if (!localTable) {
    return sql;
  }
  const tableName = removeSuffix(objectName.toLowerCase());
  sfMetadata.fields.forEach(sfField => {
    const columnName = removeSuffix(sfField.name.toLowerCase());
    const localColumn = localTable.columns.find(col => col.name === columnName);
    if (!localColumn) {
      sql += `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${convertSalesforceTypeToPostgres(
        sfField
      )}`;
      if (
        sfField.type === 'reference' &&
        sfField.referenceTo &&
        sfField.referenceTo.length > 0
      ) {
        const referenceObject = sfField.referenceTo[0];
        if (allObjects.includes(referenceObject)) {
          sql += ` REFERENCES ${removeSuffix(
            referenceObject.toLowerCase()
          )}(id)`;
        }
      }
      sql += ';\n';
    } else if (convertSalesforceTypeToPostgres(sfField) !== localColumn.type) {
      sql += `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${convertSalesforceTypeToPostgres(
        sfField
      )};\n`;
    }
  });
  sfMetadata.fields.forEach(sfField => {
    if (
      sfField.type === 'reference' &&
      sfField.referenceTo &&
      sfField.referenceTo.length > 0
    ) {
      const referenceObject = sfField.referenceTo[0];
      if (allObjects.includes(referenceObject)) {
        const columnName = removeSuffix(sfField.name.toLowerCase());
        const constraintName = `fk_${tableName}_${columnName}`;
        sql += `DO $$\n`;
        sql += `BEGIN\n`;
        sql += `  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') THEN\n`;
        sql += `    ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} `;
        sql += `FOREIGN KEY (${columnName}) REFERENCES ${removeSuffix(
          referenceObject.toLowerCase()
        )}(id);\n`;
        sql += `  END IF;\n`;
        sql += `END $$;\n\n`;
      }
    }
  });
  localTable.columns.forEach(localColumn => {
    if (
      !sfMetadata.fields.some(
        sfField => removeSuffix(sfField.name.toLowerCase()) === localColumn.name
      )
    ) {
      sql += `ALTER TABLE ${tableName} DROP COLUMN ${localColumn.name};\n`;
    }
  });

  return sql;
}
