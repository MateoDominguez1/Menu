CREATE TABLE `ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'otros' NOT NULL,
	`base_unit` text NOT NULL,
	`grams_per_unit` real,
	`kcal_100` real,
	`protein_100` real,
	`carbs_100` real,
	`fat_100` real,
	`nutrition_source` text,
	`nutrition_is_estimate` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_name_unique` ON `ingredients` (`name`);--> statement-breakpoint
CREATE TABLE `meal_plan_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`recipe_id` integer,
	`servings` real DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`skip_reason` text,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_slot_unique` ON `meal_plan_entries` (`plan_id`,`date`,`slot`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text NOT NULL,
	`days` integer DEFAULT 7 NOT NULL,
	`budget_cents` integer NOT NULL,
	`generator` text DEFAULT 'local' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredient_id` integer,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`category` text DEFAULT 'otros' NOT NULL,
	`location` text DEFAULT 'despensa' NOT NULL,
	`expires_on` text,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `price_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`promo_price_cents` integer,
	`promo_conditions` text,
	`source_kind` text NOT NULL,
	`source_ref` text,
	`observed_at` text NOT NULL,
	`valid_until` text,
	`confirmed_by_user` integer DEFAULT false NOT NULL,
	`is_estimate` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_records_product_idx` ON `price_records` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`pack_size` real NOT NULL,
	`pack_unit` text NOT NULL,
	`sold_by_weight` integer DEFAULT false NOT NULL,
	`url` text,
	`notes` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_ingredient_idx` ON `products` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`country` text DEFAULT 'IT' NOT NULL,
	`weekly_budget_cents` integer DEFAULT 5000 NOT NULL,
	`goal` text DEFAULT 'equilibrada_perdida_grasa' NOT NULL,
	`kcal_target` integer,
	`protein_target_g` integer,
	`cook_minutes_per_meal` integer DEFAULT 30 NOT NULL,
	`fridge_limited` integer DEFAULT true NOT NULL,
	`plan_breakfast` integer DEFAULT false NOT NULL,
	`plan_lunch` integer DEFAULT true NOT NULL,
	`plan_dinner` integer DEFAULT true NOT NULL,
	`plan_snacks` integer DEFAULT false NOT NULL,
	`meal_prep_required` integer DEFAULT false NOT NULL,
	`travel_cost_cents` integer DEFAULT 300 NOT NULL,
	`time_penalty_cents` integer DEFAULT 200 NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `profile_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`note` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_idx` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipe_prefs` (
	`recipe_id` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`meal_type` text NOT NULL,
	`minutes` integer DEFAULT 20 NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`image_url` text,
	`tags` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`ingredient_id` integer,
	`name` text NOT NULL,
	`category` text DEFAULT 'otros' NOT NULL,
	`unit` text NOT NULL,
	`needed_qty` real DEFAULT 0 NOT NULL,
	`pantry_qty` real DEFAULT 0 NOT NULL,
	`to_buy_qty` real DEFAULT 0 NOT NULL,
	`product_id` integer,
	`store_id` integer,
	`est_price_cents` integer,
	`price_status` text DEFAULT 'unknown' NOT NULL,
	`real_price_cents` integer,
	`checked` integer DEFAULT false NOT NULL,
	`checked_at` text,
	`is_manual` integer DEFAULT false NOT NULL,
	`qty_overridden` integer DEFAULT false NOT NULL,
	`removed_at` text,
	FOREIGN KEY (`list_id`) REFERENCES `shopping_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shopping_items_list_idx` ON `shopping_items` (`list_id`);--> statement-breakpoint
CREATE TABLE `shopping_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`strategy` text DEFAULT 'esselunga' NOT NULL,
	`actual_total_cents` integer,
	`inventory_applied` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`);