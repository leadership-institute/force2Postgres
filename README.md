# Force2Postgres

Force2Postgres is a tool that converts Salesforce object metadata to PostgreSQL Data Definition Language (DDL) and provides comprehensive documentation for your Salesforce schema.

## Features

- Authenticate with Salesforce using JSForce
- Fetch metadata for specified Salesforce objects or all objects
- Generate PostgreSQL DDL for tables, including:
  - Field mappings from Salesforce to PostgreSQL data types
  - Handling of lookup and master-detail relationships
  - Creation of separate tables for picklist fields with more than two options
  - Creation of junction tables for multipicklist fields
- Generate comprehensive Markdown documentation for each object
- Create ALTER statements to update existing PostgreSQL schemas
- Handle picklist value changes with INSERT and DELETE statements
- Remove "__c" suffix from custom field and object names in PostgreSQL

## Generated Tables

| Salesforce Object | PostgreSQL Tables |
|-------------------|-------------------|
| (No tables generated yet) |

## Usage

Run the following command to process Salesforce objects:

```
npm start -- [object names]
```

Use the `--all` flag to process all Salesforce objects:

```
npm start -- --all
```

## License

This project is licensed under the MIT License.
