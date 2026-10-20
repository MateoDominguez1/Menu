CREATE TABLE `offer_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` integer NOT NULL,
	`label` text NOT NULL,
	`valid_from` text,
	`valid_until` text NOT NULL,
	`offer_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`category` text DEFAULT 'otros_alimentos' NOT NULL,
	`price_cents` integer NOT NULL,
	`regular_cents` integer,
	`discount_pct` integer,
	`unit_price_cents` integer,
	`unit_price_label` text,
	`per_kg` integer DEFAULT false NOT NULL,
	`needs_card` integer DEFAULT false NOT NULL,
	`condition` text,
	`pack_size` real,
	`pack_unit` text,
	`ingredient_id` integer,
	`valid_from` text,
	`valid_until` text NOT NULL,
	`page` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `offer_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `offers_store_idx` ON `offers` (`store_id`);--> statement-breakpoint
CREATE INDEX `offers_valid_idx` ON `offers` (`valid_until`);--> statement-breakpoint
CREATE INDEX `offers_ingredient_idx` ON `offers` (`ingredient_id`);--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `offer_id` integer REFERENCES offers(id);