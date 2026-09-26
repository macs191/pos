ALTER TABLE `audit_logs` MODIFY COLUMN `metadata` json;--> statement-breakpoint
ALTER TABLE `subscription_plans` MODIFY COLUMN `features` json;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `permissions` json;