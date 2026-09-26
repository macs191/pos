CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supermarketId` int,
	`userId` int,
	`action` varchar(120) NOT NULL,
	`entity` varchar(80) NOT NULL,
	`entityId` varchar(80),
	`metadata` json NOT NULL DEFAULT ('{}'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supermarketId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`address` text,
	`phone` varchar(40),
	`status` varchar(32) NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supermarketId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_tenant_name_idx` UNIQUE(`supermarketId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supermarketId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(40),
	`address` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supermarketId` int NOT NULL,
	`branchId` int,
	`productId` int NOT NULL,
	`userId` int,
	`type` varchar(32) NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`previousQuantity` decimal(12,3) NOT NULL,
	`newQuantity` decimal(12,3) NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`productId` int NOT NULL,
	`productNameSnapshot` varchar(200) NOT NULL,
	`barcodeSnapshot` varchar(80) NOT NULL,
	`unitPrice` decimal(12,2) NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`total` decimal(12,2) NOT NULL,
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supermarketId` int NOT NULL,
	`branchId` int,
	`cashierId` int,
	`customerId` int,
	`invoiceNumber` varchar(80) NOT NULL,
	`subtotal` decimal(12,2) NOT NULL,
	`discount` decimal(12,2) NOT NULL DEFAULT '0',
	`tax` decimal(12,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL,
	`paymentMethod` varchar(32) NOT NULL DEFAULT 'CASH',
	`status` varchar(32) NOT NULL DEFAULT 'PAID',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supermarketId` int NOT NULL,
	`branchId` int,
	`categoryId` int,
	`name` varchar(200) NOT NULL,
	`barcode` varchar(80) NOT NULL,
	`sku` varchar(80),
	`brand` varchar(120),
	`unit` varchar(40) NOT NULL DEFAULT 'قطعة',
	`sellingPrice` decimal(12,2) NOT NULL,
	`costPrice` decimal(12,2) NOT NULL DEFAULT '0',
	`stockQuantity` decimal(12,3) NOT NULL DEFAULT '0',
	`minimumStock` decimal(12,3) NOT NULL DEFAULT '5',
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_tenant_barcode_idx` UNIQUE(`supermarketId`,`barcode`)
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`code` varchar(32) NOT NULL,
	`price` decimal(12,2) NOT NULL DEFAULT '0',
	`durationDays` int NOT NULL DEFAULT 30,
	`maxProducts` int,
	`maxUsers` int,
	`maxBranches` int,
	`maxInvoices` int,
	`features` json NOT NULL DEFAULT ('[]'),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_plans_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supermarketId` int NOT NULL,
	`planId` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'ACTIVE',
	`startDate` timestamp NOT NULL DEFAULT (now()),
	`endDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supermarkets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`slug` varchar(180) NOT NULL,
	`phone` varchar(40),
	`address` text,
	`status` varchar(32) NOT NULL DEFAULT 'ACTIVE',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supermarkets_id` PRIMARY KEY(`id`),
	CONSTRAINT `supermarkets_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` varchar(32) NOT NULL DEFAULT 'OWNER';--> statement-breakpoint
ALTER TABLE `users` ADD `supermarketId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `branchId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `permissions` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `audit_logs_date_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `branches_tenant_idx` ON `branches` (`supermarketId`);--> statement-breakpoint
CREATE INDEX `customers_tenant_idx` ON `customers` (`supermarketId`);--> statement-breakpoint
CREATE INDEX `inventory_movements_tenant_date_idx` ON `inventory_movements` (`supermarketId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `invoices_tenant_date_idx` ON `invoices` (`supermarketId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `products_tenant_search_idx` ON `products` (`supermarketId`,`name`);--> statement-breakpoint
CREATE INDEX `subscriptions_tenant_idx` ON `subscriptions` (`supermarketId`);--> statement-breakpoint
CREATE INDEX `users_tenant_idx` ON `users` (`supermarketId`);