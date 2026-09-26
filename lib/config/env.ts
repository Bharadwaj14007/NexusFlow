import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_CHAT_MODEL: z.string().min(1).optional(),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  RAZORPAY_PRO_PLAN_ID: z.string().min(1).optional(),
  RAZORPAY_ENTERPRISE_PLAN_ID: z.string().min(1).optional(),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(32).optional(),
  SLACK_CLIENT_ID: z.string().min(1).optional(),
  SLACK_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  LINEAR_CLIENT_ID: z.string().min(1).optional(),
  LINEAR_CLIENT_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  WORKFLOW_CRON_SECRET: z.string().min(1).optional(),
})

export function getServerEnv() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Server configuration is invalid or incomplete: ${missing}`)
  }
  return parsed.data
}

export function isConfigured(name: keyof z.infer<typeof envSchema>) {
  return Boolean(process.env[name])
}
