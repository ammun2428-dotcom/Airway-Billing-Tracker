# Airway Bill & Document Tracker

A premium, modern logistics management system designed for **ORBEM Solutions Private Limited** to track airway bills (AWB), manage document compliance (invoices, packing lists, ID proofs, cargo declarations), and run AI-powered quotation and routing evaluations.

Built using a lightweight serverless architecture, this project is designed to run locally and deploy directly to **Vercel** with a single click.

---

## 🚀 Key Features

- **Operations Dashboard**: Real-time stats on pending documents, cargo clearance rates, and active shipments.
- **Master Registry**: Interactive data grid to search, filter, and modify shipment records.
- **Volumetric Weight Calculator**: Dynamic chargeable weight checks (checks Actual Weight vs. Dimensional Volume ($L \times W \times H \text{ in cm} / 6000$)).
- **LLaMA 3.1 AI Cargo Lab (Groq)**:
  - Generates realistic air freight quotes.
  - Identifies destination customs regulations.
  - Recommends flight connections and hubs.
  - Cleans up and standardizes messy cargo descriptions.
- **Double Connection Safeguard**: Works in **Local Simulation Mode** out-of-the-box (no API keys needed). Automatically elevates to **Live Mode** when Supabase and Groq keys are configured.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, CSS3 (Glassmorphism theme), and JavaScript. Loaded with [Lucide Icons](https://lucide.dev/) and [Marked.js](https://marked.js.org/).
- **Backend**: Node.js Serverless API endpoints (`/api/*` mapped via Vercel).
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL).
- **AI Core**: [Groq Cloud Console](https://console.groq.com/) utilizing free LLaMA 3.1 models.

---

## 💻 Local Setup Instructions

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your computer.

### Step 1: Install Dependencies
Open your terminal inside this project folder (`c:\Users\HP\Downloads\intern`) and run:
```bash
npm install
```

### Step 2: Configure Environment Variables
1. Copy the `.env.example` file and rename it to `.env`:
   ```bash
   copy .env.example .env
   ```
2. Open `.env` and fill in your Supabase credentials and Groq API key:
   - `SUPABASE_URL`: Your Supabase Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role API key.
   - `GROQ_API_KEY`: Your Groq Cloud LLaMA API key.

*Note: If you leave these values as default, the app will run using a local JSON database fallback (`shipments_db.json`) and LLaMA AI simulation!*

### Step 3: Set up Supabase PostgreSQL
Log in to your **Supabase Dashboard**, open the **SQL Editor** in your project, and run this query to create the shipments table:

```sql
create table shipments (
  id uuid default gen_random_uuid() primary key,
  awb_number text unique not null,
  sender_name text not null,
  receiver_name text not null,
  origin text not null,
  destination text not null,
  cargo_type text not null,
  cargo_description text,
  weight numeric not null,
  dimensions text not null,
  chargeable_weight numeric not null,
  has_invoice boolean default false,
  has_packing_list boolean default false,
  has_id_proof boolean default false,
  has_cargo_declaration boolean default false,
  status text default 'Pending Documents' not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Enable row level security policy for prototype access
alter table shipments enable row level security;
create policy "Allow public access" on shipments for all using (true) with check (true);
```

### Step 4: Run Locally
To run the serverless backend functions and serve the static frontend together, install Vercel CLI globally and run it:
```bash
npm install -g vercel
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploy to Vercel

Vercel will build this project automatically. 

1. Push your project code to a **GitHub** repository.
2. Go to **Vercel** and select **Add New Project** -> Import your repository.
3. In **Environment Variables**, add the keys from your `.env` file:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GROQ_API_KEY`
4. Click **Deploy**. Vercel will host the static frontend on the root and host `/api/shipments` and `/api/ai` as Node.js serverless functions!
