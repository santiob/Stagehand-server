import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 120000,
  workers: 1,
  retries: 1,
  reporter: [['list'],
    ['html', { outputFolder: '/home/santi/stagehand-server/playwright-report', open: 'never' }],
    ['junit', { outputFile: '/home/santi/stagehand-server/test-results/results.xml' }]],
  
  projects: [
    {
      name: 'Saltena',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        baseURL: process.env.TEST_SLA_BASE_URL,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
      testMatch: '**/tombo.stagehand.spec.ts',
    },
    {
      name: 'Rionegrina',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        baseURL: process.env.TEST_RN_BASE_URL,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
      testMatch: '**/quiniex.stagehand.spec.ts',
    },
    {
      name: 'Neuquina',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        baseURL: process.env.TEST_NQN_BASE_URL,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
      testMatch: '**/quinielainsta.stagehand.spec.ts',
    },
  ],
});
