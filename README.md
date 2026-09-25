# Sriora Store

A single-folder e-commerce storefront built with Node.js and Express.

## Features
- Product listing page
- Product enquiry via WhatsApp
- Admin login
- Add and delete products
- Image uploads
- Works as one project folder without split frontend/backend folders

## Run locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Environment variables

Create a `.env` file in the project root:

```env
PORT=3000
ADMIN_USERNAME=sriora-store
ADMIN_PASSWORD=sriora@888
JWT_SECRET=sriora-secret-key
WHATSAPP_NUMBER=918885204608
```

## Deployment
This project is built as a single app and can be deployed to Render, Railway, or a similar Node host.
