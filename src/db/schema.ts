import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const BASE_UNITS = ["g", "ml", "unit"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const CATEGORIES = [
  "fruta_verdura",
  "carne_pescado",
  "lacteos_huevos",
  "pasta_arroz_cereales",
  "conservas_secos",
  "congelados",
  "higiene_limpieza",
  "otros",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Slot = (typeof SLOTS)[number];

export const LOCATIONS = ["despensa", "heladera", "congelador"] as const;
export type Location = (typeof LOCATIONS)[number];

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey(),
  country: text("country").notNull().default("IT"),
  weeklyBudgetCents: integer("weekly_budget_cents").notNull().default(5000),
  goal: text("goal").notNull().default("equilibrada_perdida_grasa"),
  kcalTarget: integer("kcal_target"),
  proteinTargetG: integer("protein_target_g"),
  cookMinutesPerMeal: integer("cook_minutes_per_meal").notNull().default(30),
  fridgeLimited: integer("fridge_limited", { mode: "boolean" })
    .notNull()
    .default(true),
  planBreakfast: integer("plan_breakfast", { mode: "boolean" })
    .notNull()
    .default(false),
  planLunch: integer("plan_lunch", { mode: "boolean" }).notNull().default(true),
  planDinner: integer("plan_dinner", { mode: "boolean" })
    .notNull()
    .default(true),
  planSnacks: integer("plan_snacks", { mode: "boolean" })
    .notNull()
    .default(false),
  mealPrepRequired: integer("meal_prep_required", { mode: "boolean" })
    .notNull()
    .default(false),
  travelCostCents: integer("travel_cost_cents").notNull().default(300),
  timePenaltyCents: integer("time_penalty_cents").notNull().default(200),
  notes: text("notes"),
});

export const profileRules = sqliteTable("profile_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", {
    enum: ["allergy", "avoid", "restriction", "staple"],
  }).notNull(),
  value: text("value").notNull(),
});

export const stores = sqliteTable("stores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  notes: text("notes"),
});

export const ingredients = sqliteTable("ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  category: text("category", { enum: CATEGORIES }).notNull().default("otros"),
  baseUnit: text("base_unit", { enum: BASE_UNITS }).notNull(),
  gramsPerUnit: real("grams_per_unit"),
  kcal100: real("kcal_100"),
  protein100: real("protein_100"),
  carbs100: real("carbs_100"),
  fat100: real("fat_100"),
  nutritionSource: text("nutrition_source"),
  nutritionIsEstimate: integer("nutrition_is_estimate", { mode: "boolean" })
    .notNull()
    .default(true),
});

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  mealType: text("meal_type", { enum: SLOTS }).notNull(),
  minutes: integer("minutes").notNull().default(20),
  servings: real("servings").notNull().default(1),
  instructions: text("instructions").notNull().default(""),
  imageUrl: text("image_url"),
  tags: text("tags").notNull().default(""),
  /** "manual": cargada por el usuario o semilla. "generated": compuesta por la app a partir de las ofertas. */
  source: text("source", { enum: ["manual", "generated"] }).notNull().default("manual"),
  createdAt: createdAt(),
});

export const recipeIngredients = sqliteTable(
  "recipe_ingredients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    quantity: real("quantity").notNull(),
    note: text("note"),
  },
  (t) => [index("recipe_ingredients_recipe_idx").on(t.recipeId)],
);

export const recipePrefs = sqliteTable("recipe_prefs", {
  recipeId: integer("recipe_id")
    .primaryKey()
    .references(() => recipes.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["favorite", "discarded"] }).notNull(),
});

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    name: text("name").notNull(),
    brand: text("brand"),
    packSize: real("pack_size").notNull(),
    packUnit: text("pack_unit", { enum: BASE_UNITS }).notNull(),
    soldByWeight: integer("sold_by_weight", { mode: "boolean" })
      .notNull()
      .default(false),
    url: text("url"),
    notes: text("notes"),
  },
  (t) => [index("products_ingredient_idx").on(t.ingredientId)],
);

export const priceRecords = sqliteTable(
  "price_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    promoPriceCents: integer("promo_price_cents"),
    promoConditions: text("promo_conditions"),
    sourceKind: text("source_kind", {
      enum: ["manual", "csv", "flyer", "web", "adapter", "user_confirmed"],
    }).notNull(),
    sourceRef: text("source_ref"),
    observedAt: text("observed_at").notNull(),
    validUntil: text("valid_until"),
    confirmedByUser: integer("confirmed_by_user", { mode: "boolean" })
      .notNull()
      .default(false),
    isEstimate: integer("is_estimate", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [index("price_records_product_idx").on(t.productId)],
);

export const OFFER_CATEGORIES = [
  "carne",
  "pescado",
  "fiambres_quesos",
  "lacteos_huevos",
  "fruta_verdura",
  "pan_panaderia",
  "pasta_arroz",
  "conservas_despensa",
  "congelados",
  "bebidas",
  "snacks_dulces",
  "otros_alimentos",
] as const;

/** Cada importacion de un volantino: sirve para auditar de donde vienen las ofertas. */
export const offerImports = sqliteTable("offer_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storeId: integer("store_id")
    .notNull()
    .references(() => stores.id),
  label: text("label").notNull(),
  validFrom: text("valid_from"),
  validUntil: text("valid_until").notNull(),
  offerCount: integer("offer_count").notNull().default(0),
  importedAt: createdAt(),
});

/** Cualquier producto en oferta de un volantino, este o no ligado a un ingrediente de las recetas. */
export const offers = sqliteTable(
  "offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    importId: integer("import_id")
      .notNull()
      .references(() => offerImports.id, { onDelete: "cascade" }),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    brand: text("brand"),
    category: text("category", { enum: OFFER_CATEGORIES }).notNull().default("otros_alimentos"),
    priceCents: integer("price_cents").notNull(),
    regularCents: integer("regular_cents"),
    discountPct: integer("discount_pct"),
    unitPriceCents: integer("unit_price_cents"),
    unitPriceLabel: text("unit_price_label", { enum: ["kg", "L"] }),
    perKg: integer("per_kg", { mode: "boolean" }).notNull().default(false),
    needsCard: integer("needs_card", { mode: "boolean" }).notNull().default(false),
    condition: text("condition"),
    packSize: real("pack_size"),
    packUnit: text("pack_unit", { enum: BASE_UNITS }),
    ingredientId: integer("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
    validFrom: text("valid_from"),
    validUntil: text("valid_until").notNull(),
    page: integer("page"),
    createdAt: createdAt(),
  },
  (t) => [
    index("offers_store_idx").on(t.storeId),
    index("offers_valid_idx").on(t.validUntil),
    index("offers_ingredient_idx").on(t.ingredientId),
  ],
);

export const mealPlans = sqliteTable("meal_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekStart: text("week_start").notNull(),
  days: integer("days").notNull().default(7),
  budgetCents: integer("budget_cents").notNull(),
  generator: text("generator").notNull().default("local"),
  createdAt: createdAt(),
});

export const mealPlanEntries = sqliteTable(
  "meal_plan_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    slot: text("slot", { enum: SLOTS }).notNull(),
    recipeId: integer("recipe_id").references(() => recipes.id, {
      onDelete: "set null",
    }),
    servings: real("servings").notNull().default(1),
    status: text("status", { enum: ["planned", "skipped", "eaten"] })
      .notNull()
      .default("planned"),
    skipReason: text("skip_reason", { enum: ["work", "out", "other"] }),
  },
  (t) => [uniqueIndex("plan_slot_unique").on(t.planId, t.date, t.slot)],
);

export const shoppingLists = sqliteTable("shopping_lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id")
    .notNull()
    .references(() => mealPlans.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["open", "done"] })
    .notNull()
    .default("open"),
  strategy: text("strategy", { enum: ["esselunga", "iper", "split"] })
    .notNull()
    .default("esselunga"),
  actualTotalCents: integer("actual_total_cents"),
  inventoryApplied: integer("inventory_applied", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: createdAt(),
});

export const shoppingItems = sqliteTable(
  "shopping_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id").references(() => ingredients.id),
    offerId: integer("offer_id").references(() => offers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    category: text("category", { enum: CATEGORIES }).notNull().default("otros"),
    unit: text("unit", { enum: BASE_UNITS }).notNull(),
    neededQty: real("needed_qty").notNull().default(0),
    pantryQty: real("pantry_qty").notNull().default(0),
    toBuyQty: real("to_buy_qty").notNull().default(0),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    storeId: integer("store_id").references(() => stores.id),
    estPriceCents: integer("est_price_cents"),
    priceStatus: text("price_status", {
      enum: ["estimated", "confirmed", "unknown"],
    })
      .notNull()
      .default("unknown"),
    realPriceCents: integer("real_price_cents"),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
    checkedAt: text("checked_at"),
    isManual: integer("is_manual", { mode: "boolean" })
      .notNull()
      .default(false),
    qtyOverridden: integer("qty_overridden", { mode: "boolean" })
      .notNull()
      .default(false),
    removedAt: text("removed_at"),
  },
  (t) => [index("shopping_items_list_idx").on(t.listId)],
);

export const pantryItems = sqliteTable("pantry_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ingredientId: integer("ingredient_id").references(() => ingredients.id),
  name: text("name").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit", { enum: BASE_UNITS }).notNull(),
  category: text("category", { enum: CATEGORIES }).notNull().default("otros"),
  location: text("location", { enum: LOCATIONS }).notNull().default("despensa"),
  expiresOn: text("expires_on"),
});

export type Offer = typeof offers.$inferSelect;
export type Profile = typeof profile.$inferSelect;
export type Ingredient = typeof ingredients.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type Product = typeof products.$inferSelect;
export type PriceRecord = typeof priceRecords.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type MealPlanEntry = typeof mealPlanEntries.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type PantryItem = typeof pantryItems.$inferSelect;
