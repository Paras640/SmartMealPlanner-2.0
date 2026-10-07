const MEAT_AND_SEAFOOD = /\b(chicken|turkey|duck|goose|quail|beef|veal|bison|pork|ham|bacon|lamb|mutton|goat|venison|rabbit|meat|fish|salmon|tuna|cod|trout|anchovy|sardine|herring|tilapia|prawn|shrimp|crab|lobster|crayfish|oyster|mussel|clam|scallop|squid|octopus|gelatin|gelatine|lard|suet|anchovy)\b/i;
const ANIMAL_PRODUCTS = /\b(milk|cream|butter|ghee|cheese|yogurt|yoghurt|whey|casein|egg|eggs|mayonnaise|honey|gelatin|gelatine|lard|suet)\b/i;
const MEAT_CATEGORIES = /\b(chicken|beef|pork|lamb|goat|seafood|fish|meat|non vegetarian|non-vegetarian)\b/i;
const BEEF_TERMS = /\b(beef|veal|oxtail|ox\s+tail)\b/i;

function getRecipeIngredients(recipe) {
  if (Array.isArray(recipe?.ingredients)) {
    return recipe.ingredients.map((ingredient) => (
      typeof ingredient === "string" ? ingredient : ingredient?.name || ""
    ));
  }

  return Object.entries(recipe || {})
    .filter(([key, value]) => /^strIngredient\d+$/.test(key) && typeof value === "string" && value.trim())
    .map(([, value]) => value.trim());
}

export function containsBeef(recipe) {
  const category = typeof recipe?.mealType === "string"
    ? recipe.mealType
    : typeof recipe?.strCategory === "string" ? recipe.strCategory : "";
  const title = typeof recipe?.title === "string"
    ? recipe.title
    : typeof recipe?.strMeal === "string" ? recipe.strMeal : "";

  return BEEF_TERMS.test(`${title} ${category} ${getRecipeIngredients(recipe).join(" ")}`);
}

export function isRecipeAllowedForDiet(recipe, dietaryPreference) {
  if (containsBeef(recipe)) return false;

  const diet = typeof dietaryPreference === "string" ? dietaryPreference.trim().toLowerCase() : "";
  if (diet === "all" || diet === "anything" || diet === "no preference" || diet === "non-veg" || diet === "non-vegetarian" || diet === "keto" || diet === "low-carb" || diet === "low carb" || diet === "seafood") {
    return true;
  }

  const ingredients = getRecipeIngredients(recipe);
  if (ingredients.length === 0) return false;

  const category = typeof recipe?.mealType === "string"
    ? recipe.mealType
    : typeof recipe?.strCategory === "string" ? recipe.strCategory : "";
  const isVegan = diet === "vegan";
  const containsRestrictedIngredient = ingredients.some((ingredient) => (
    MEAT_AND_SEAFOOD.test(ingredient) || (isVegan && ANIMAL_PRODUCTS.test(ingredient))
  ));

  if (containsRestrictedIngredient) return false;
  if (MEAT_CATEGORIES.test(category)) return false;
  return true;
}
