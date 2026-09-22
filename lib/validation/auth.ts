import { z } from 'zod'

export const emailSchema = z.string().trim().email('Enter a valid work email.').transform((value) => value.toLowerCase())

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(2, 'Enter your name.').max(100, 'Name is too long.'),
})

export const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.'),
  organizationName: z.string().trim().min(3, 'Organization name must be at least 3 characters.'),
  organizationType: z.string().trim().min(1).optional(),
})

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(3, 'Organization name must be at least 3 characters.'),
  type: z.string().trim().min(1).optional(),
})

export const updateOrganizationSchema = createOrganizationSchema

export const switchOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
})
