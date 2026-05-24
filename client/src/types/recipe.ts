// Shared client-side types. The "Recipe"/"Ingredient" shapes mirror
// the server's models exactly; "MealdbMeal" matches what the server
// proxy forwards from TheMealDB so the proxy responses can be typed.

export interface Ingredient {
  name: string;
  quantity?: string;
  unit?: string;
}

export interface Recipe {
  id: string;
  title: string;
  source: "themealdb" | "manual" | string;
  sourceId?: string;
  category?: string;
  area?: string;
  tags: string[];
  imageUrl?: string;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  servings?: number | null;
  ingredients: Ingredient[];
  steps: string[];
  youtubeUrl?: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type RecipeInput = Partial<
  Omit<Recipe, "id" | "createdAt" | "updatedAt">
> & { title: string };

/** A single TheMealDB meal record (unaltered upstream shape). */
export interface MealdbMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string;
  strArea?: string;
  strTags?: string;
  strMealThumb?: string;
  strYoutube?: string;
  strSource?: string;
  strInstructions?: string;
  // strIngredient1..20 / strMeasure1..20 are too noisy to type — read dynamically.
  [key: string]: string | undefined;
}

export interface MealsEnvelope {
  meals: MealdbMeal[] | null;
}

export interface MealdbCategory {
  idCategory: string;
  strCategory: string;
  strCategoryThumb: string;
  strCategoryDescription: string;
}
export interface CategoriesEnvelope {
  categories: MealdbCategory[];
}

export interface MealdbFilterItem {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
}
export interface FilterEnvelope {
  meals: MealdbFilterItem[] | null;
}
