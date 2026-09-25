require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');
const dataDir = path.join(rootDir, 'data');
const uploadsDir = path.join(rootDir, 'uploads');
const productsFile = path.join(dataDir, 'products.json');
const JWT_SECRET = process.env.JWT_SECRET || 'sriora-secret-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'sriora-store';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sriora@888';

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(path.join(uploadsDir, '.gitkeep'))) {
  fs.writeFileSync(path.join(uploadsDir, '.gitkeep'), '');
}
if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(productsFile, JSON.stringify([], null, 2));
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '.jpg');
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  }
});

function readProducts() {
  try {
    const raw = fs.readFileSync(productsFile, 'utf8');
    const products = JSON.parse(raw);
    return Array.isArray(products) ? products : [];
  } catch (error) {
    return [];
  }
}

function writeProducts(products) {
  fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));
}

function productResponse(product) {
  return {
    ...product,
    photos: Array.isArray(product.photos) ? product.photos : []
  };
}

function createToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Sriora Store API is running' });
});

app.get('/api/products', (req, res) => {
  const search = (req.query.search || '').toLowerCase().trim();
  let products = readProducts();

  if (search) {
    products = products.filter((product) => {
      const matchText = `${product.name || ''} ${product.description || ''}`.toLowerCase();
      return matchText.includes(search);
    });
  }

  res.json(products.map(productResponse));
});

app.get('/api/products/:id', (req, res) => {
  const product = readProducts().find((item) => item.id === req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(productResponse(product));
});

app.get('/api/products/:id/instagram', (req, res) => {
  const product = readProducts().find((item) => item.id === req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const profile = process.env.INSTAGRAM_USERNAME || 'sriora.crochets';
  const message = encodeURIComponent(`Hi, I want to enquire about ${product.name} for ₹${product.price}.`);
  const instagramLink = `https://ig.me/m/${profile}?text=${message}`;
  res.json({ instagramLink, product: product.name, price: product.price });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const isValid = username === ADMIN_USERNAME && bcrypt.compareSync(password, bcrypt.hashSync(ADMIN_PASSWORD, 10));
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  res.json({
    token: createToken(username),
    username
  });
});

app.get('/api/admin/products', verifyToken, (req, res) => {
  res.json(readProducts().map(productResponse));
});

app.post('/api/admin/products', verifyToken, upload.array('photos', 10), (req, res) => {
  const products = readProducts();
  const { name, description, price } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  const newProduct = {
    id: uuidv4(),
    name: name.trim(),
    description: description || '',
    price: Number(price),
    photos: (req.files || []).map((file) => `/uploads/${file.filename}`),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  products.unshift(newProduct);
  writeProducts(products);

  res.status(201).json(productResponse(newProduct));
});

app.put('/api/admin/products/:id', verifyToken, upload.array('photos', 10), (req, res) => {
  const products = readProducts();
  const index = products.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const existing = products[index];
  const existingPhotos = (() => {
    try {
      const raw = req.body.existingPhotos;
      if (!raw) return existing.photos || [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : existing.photos || [];
    } catch (error) {
      return existing.photos || [];
    }
  })();

  const uploadedPhotos = (req.files || []).map((file) => `/uploads/${file.filename}`);

  products[index] = {
    ...existing,
    name: req.body.name || existing.name,
    description: req.body.description !== undefined ? req.body.description : existing.description,
    price: req.body.price !== undefined ? Number(req.body.price) : existing.price,
    photos: [...existingPhotos, ...uploadedPhotos],
    updatedAt: new Date().toISOString()
  };

  writeProducts(products);
  res.json(productResponse(products[index]));
});

app.delete('/api/admin/products/:id', verifyToken, (req, res) => {
  const products = readProducts();
  const filtered = products.filter((item) => item.id !== req.params.id);

  if (filtered.length === products.length) {
    return res.status(404).json({ error: 'Product not found' });
  }

  writeProducts(filtered);
  res.json({ message: 'Product deleted successfully' });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(publicDir, 'index.html'));
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`Sriora Store is running on http://localhost:${PORT}`);
});
