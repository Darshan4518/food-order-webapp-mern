const Food = require("../models/Food.js");
const Category = require("../models/Category.js");
const redisClient = require("../config/redisConfig.js");

const handleError = (res, error, statusCode = 400) => {
  res.status(statusCode).json({ message: error.message });
};

const setCache = (key, data) => {
  redisClient.setEx(key, 3600, JSON.stringify(data), (err) => {
    if (err) console.error("Error setting cache:", err);
  });
};

const getCache = (key, callback) => {
  redisClient.get(key, (err, data) => {
    if (err) return console.error("Error getting cache:", err);
    callback(data ? JSON.parse(data) : null);
  });
};

// Create a new food item
exports.createFood = async (req, res) => {
  const { name, description, price, category, foodType } = req.body;
  const images = req.files?.map((file) => file.path);

  try {
    const newFood = new Food({
      name,
      description,
      price,
      images,
      category,
      foodType,
    });
    await newFood.save();
    redisClient.del("foods");
    res.status(201).json(newFood);
  } catch (error) {
    handleError(res, error);
  }
};

// Get all food items
exports.getFood = async (req, res) => {
  getCache("foods", async (cachedData) => {
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    try {
      const foods = await Food.find().lean().populate("category");
      setCache("foods", foods);
      res.status(200).json(foods);
    } catch (error) {
      handleError(res, error);
    }
  });
};

// Update an existing food item
exports.updateFood = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category, foodType } = req.body;
  const images = req.files?.map((file) => file.path);

  try {
    const food = await Food.findById(id);
    if (!food) {
      return handleError(res, new Error("Food not found"), 404);
    }

    food.name = name ?? food.name;
    food.description = description ?? food.description;
    food.price = price ?? food.price;
    food.category = category ?? food.category;
    food.foodType = foodType ?? food.foodType;
    if (images) food.images = images;

    await food.save();
    // Invalidate cache
    redisClient.del("foods");
    res.status(200).json(food);
  } catch (error) {
    handleError(res, error);
  }
};

// Delete a food item
exports.deleteFood = async (req, res) => {
  const { id } = req.params;

  try {
    const food = await Food.findByIdAndDelete(id);
    if (!food) {
      return handleError(res, new Error("Food not found"), 404);
    }
    // Invalidate cache
    redisClient.del("foods");
    res.status(200).json({ message: "Food deleted" });
  } catch (error) {
    handleError(res, error);
  }
};

// Get food items by category
exports.getFoodByCategory = async (req, res) => {
  const { category } = req.query;
  const cacheKey = `foods_category_${category || "all"}`;

  getCache(cacheKey, async (cachedData) => {
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    try {
      let foods;
      if (category && category !== "All") {
        const categoryDoc = await Category.findOne({ name: category }).lean();
        if (!categoryDoc) {
          return handleError(res, new Error("Category not found"), 404);
        }
        foods = await Food.find({ category: categoryDoc._id })
          .populate("category")
          .lean();
      } else {
        foods = await Food.find().populate("category").lean();
      }
      setCache(cacheKey, foods);
      res.status(200).json(foods);
    } catch (error) {
      handleError(res, error);
    }
  });
};

// Search food items by name or category
exports.searchFoodByNameOrCategory = async (req, res) => {
  const { query } = req.query;
  const cacheKey = `foods_search_${query}`;

  getCache(cacheKey, async (cachedData) => {
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    try {
      const foods = await Food.find({
        name: { $regex: query, $options: "i" },
      })
        .populate("category")
        .lean();
      setCache(cacheKey, foods);
      res.status(200).json(foods);
    } catch (error) {
      handleError(res, error);
    }
  });
};

// Search food items by price range
exports.searchFoodByPrice = async (req, res) => {
  const { minPrice, maxPrice } = req.query;
  const cacheKey = `foods_price_${minPrice || "0"}_${maxPrice || "inf"}`;

  getCache(cacheKey, async (cachedData) => {
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    try {
      const queryFilters = {};
      if (minPrice && !isNaN(minPrice))
        queryFilters.price = { $gte: parseInt(minPrice) };
      if (maxPrice && !isNaN(maxPrice))
        queryFilters.price = {
          ...queryFilters.price,
          $lte: parseInt(maxPrice),
        };

      const foods = await Food.find(queryFilters).populate("category").lean();
      setCache(cacheKey, foods);
      res.status(200).json(foods);
    } catch (error) {
      handleError(res, error);
    }
  });
};
