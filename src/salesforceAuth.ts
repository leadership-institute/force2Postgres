import jsforce from 'jsforce';
import dotenv from 'dotenv';

dotenv.config();

export async function authenticateSalesforce(): Promise<jsforce.Connection> {
  const conn = new jsforce.Connection({});

  try {
    await conn.login(
      process.env.SF_USERNAME as string,
      ((process.env.SF_PASSWORD as string) +
        process.env.SF_SECURITY_TOKEN) as string
    );
    return conn;
  } catch (error) {
    console.error('Error authenticating with Salesforce:', error);
    throw error;
  }
}
