CREATE TYPE "public"."age_cohort" AS ENUM('under_20', '20s', '30s', '40s', '50s', '60s', '70_plus');--> statement-breakpoint
CREATE TYPE "public"."contact_alignment" AS ENUM('personal', 'professional', 'both');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "alignment" "contact_alignment";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "race_or_ethnicity" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "gender" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "age_cohort" "age_cohort";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "education" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "languages" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "professional_affiliations" text[] DEFAULT ARRAY[]::text[] NOT NULL;