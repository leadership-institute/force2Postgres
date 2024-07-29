import jsforce from "jsforce";

export async function fetchObjectMetadata(
  conn: jsforce.Connection,
  objectName: string
): Promise<jsforce.DescribeSObjectResult> {
  const metadata = await conn.describe(objectName);
  return metadata;
}

export async function fetchAllObjects(
  conn: jsforce.Connection
): Promise<string[]> {
  const result = await conn.describeGlobal();
  return result.sobjects.map((obj) => obj.name);
}

export function detectCustomRelationships(
  objectName: string,
  allObjects: string[]
): string[] {
  const relationships: string[] = [];
  const parts = objectName.split("_");

  if (parts.length > 1 && objectName.endsWith("__c")) {
    const potentialParent = parts[0];
    if (allObjects.includes(potentialParent)) {
      relationships.push(potentialParent);
    }
  }

  return relationships;
}
