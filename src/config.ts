import dotenv from "dotenv";

dotenv.config();

interface Config {
  SF_USERNAME: string;
  SF_PASSWORD: string;
  SF_SECURITY_TOKEN: string;
}

const config: Config = {
  SF_USERNAME: process.env.SF_USERNAME || "",
  SF_PASSWORD: process.env.SF_PASSWORD || "",
  SF_SECURITY_TOKEN: process.env.SF_SECURITY_TOKEN || "",
};

export default config;
