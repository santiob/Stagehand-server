import { Stagehand } from "@browserbasehq/stagehand";
import "dotenv/config";

function validateEnv() {
  const required = [
    "OPENAI_API_KEY",
    "TEST_URL",
    "TEST_USERNAME",
    "TEST_PASSWORD",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `❌ Faltan variables de entorno: ${missing.join(", ")}\n` +
      `   Revisá tu archivo .env`
    );
  }
}

export interface TestCredentials {
  url: string;
  username: string;
  password: string;
}

export function getCredentials(): TestCredentials {
  return {
    url: process.env.TEST_URL!,
    username: process.env.TEST_USERNAME!,
    password: process.env.TEST_PASSWORD!,
  };
}

export async function createStagehand(): Promise<Stagehand> {
  validateEnv();

  const stagehand = new Stagehand({
    env: "LOCAL",
    model: "openai/gpt-4o",
    localBrowserLaunchOptions: {
      headless: false,
      viewport: { width: 1280, height: 720 },
    },
    verbose: 1,
  });

  await stagehand.init();
  return stagehand;
}
