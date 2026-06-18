const Groq = require('groq-sdk');
require('dotenv').config();

// Initialize Groq Client
const groqApiKey = process.env.GROQ_API_KEY;
let groq = null;

if (groqApiKey && !groqApiKey.includes('your_groq_api_key')) {
  try {
    groq = new Groq({ apiKey: groqApiKey });
    console.log("Groq client initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Groq client:", error);
  }
} else {
  console.warn("Groq API key missing. AI queries will return simulated mock responses.");
}

// ----------------------------------------------------
// Mock Responses for Local Testing without API Key
// ----------------------------------------------------
function getMockAiResponse(action, data) {
  const { origin = 'DEL', destination = 'LHR', cargo_type = 'General', weight = 150, chargeable_weight = 150, cargo_description = '' } = data;

  switch (action) {
    case 'quotation':
      const ratePerKg = cargo_type === 'Perishable' ? 4.5 : cargo_type === 'Hazardous' ? 6.5 : 3.2;
      const baseRate = parseFloat((chargeable_weight * ratePerKg).toFixed(2));
      const fuelSurcharge = parseFloat((chargeable_weight * 0.85).toFixed(2));
      const handlingFee = 120.00;
      const securityFee = 45.00;
      const total = parseFloat((baseRate + fuelSurcharge + handlingFee + securityFee).toFixed(2));

      return `### ✈️ Air Cargo Quotation Estimate (MOCK AI)
- **Origin / Destination**: ${origin} ➔ ${destination}
- **Chargeable Weight**: ${chargeable_weight} kg (Actual: ${weight} kg)
- **Cargo Type**: ${cargo_type}

#### Price Breakdown (USD):
- **Base Air Freight Rate**: $${baseRate.toLocaleString()} ($${ratePerKg}/kg)
- **Fuel Surcharge**: $${fuelSurcharge.toLocaleString()} ($0.85/kg)
- **Terminal Handling Charges**: $${handlingFee.toFixed(2)}
- **Aviation Security Fee**: $${securityFee.toFixed(2)}
- **Total Estimated Price**: **$${total.toLocaleString()}**

*Note: This is a simulated quote based on standard pricing tables. Actual airline rates may vary.*`;

    case 'customs':
      return `### 📋 Customs & Documentation Checklist (MOCK AI)
Customs guidance for shipments from **${origin}** to **${destination}** containing **${cargo_type}** goods:

#### 1. Required Core Documents:
- **Airway Bill (AWB)**: Signed master air cargo document.
- **Commercial Invoice**: Detailing seller/buyer details, HS Codes, and true transactional value.
- **Packing List**: Detailing cargo breakdown, net/gross weight, dimensions, and packaging type.
- **ID Proof**: Shipper's business registration (GST/EIN/VAT certificate) and consignee credentials.

#### 2. Specialized Requirements for **${cargo_type}** Cargo:
${
  cargo_type === 'Perishable'
    ? `- **Phytosanitary/Veterinary Certificate**: Required for biological clearance.\n- **Cold Chain Checklist**: Log of temperature levels during storage and transport.`
    : cargo_type === 'Hazardous'
    ? `- **Dangerous Goods Declaration (DGD)**: Signed declaration specifying UN Class, UN Number, Packing Group, and emergency contacts.\n- **Material Safety Data Sheet (MSDS)**: Detailing chemical details and safety hazards.`
    : cargo_type === 'Electronics'
    ? `- **LITHIUM BATTERY DECLARATION**: Mandatory if cargo contains active battery cells (UN3480/UN3481/UN3090/UN3091).\n- **Certificate of Conformity**: Verification of compliance with electrical safety codes.`
    : `- **Standard Cargo Declaration**: Declaration showing no restricted material is in the consignment.`
}

#### 3. Destination Regulations (${destination}):
- **Valuation Audit**: Local customs officials in **${destination}** may audit import taxes based on the transactional invoice.
- **Harmonized System (HS) Code Matching**: Ensure all cargo descriptions are standardized to avoid holding items at customs.`;

    case 'clean_description':
      const desc = cargo_description || 'some parts';
      let standardized = desc;
      if (desc.toLowerCase().includes('phone') || desc.toLowerCase().includes('mobile')) {
        standardized = "Electronic Devices: Telecommunication Accessories and Mobile Spares";
      } else if (desc.toLowerCase().includes('cloth') || desc.toLowerCase().includes('shirt') || desc.toLowerCase().includes('pant')) {
        standardized = "Apparel & Textiles: Finished Cotton Garments (Assorted)";
      } else if (desc.toLowerCase().includes('fruit') || desc.toLowerCase().includes('mango') || desc.toLowerCase().includes('food')) {
        standardized = "Perishable Foodstuffs: Fresh Agriculture Produce";
      } else if (desc.toLowerCase().includes('battery') || desc.toLowerCase().includes('powerbank')) {
        standardized = "Dangerous Goods Class 9: Lithium Ion Batteries (UN3480)";
      } else {
        standardized = `Standardized Freight Cargo: ${desc.substring(0, 1).toUpperCase() + desc.substring(1)} (Commercial Grade)`;
      }
      return standardized;

    case 'route_options':
      return `### 🗺️ Air Cargo Routing Analysis (MOCK AI)
Optimal itineraries between **${origin}** and **${destination}** for **${cargo_type}** goods:

#### Option 1: Direct Flight (Recommended)
- **Routing**: ${origin} ➔ ${destination}
- **Operator**: Global Cargo Express
- **Transit Time**: 9 hours
- **Aviation Advantage**: Minimizes handling risk. Perfect for **${cargo_type}** cargo where temperature control or quick turnaround is vital.

#### Option 2: Hub Transfer (Cost Saver)
- **Routing**: ${origin} ➔ DXB (Dubai Hub) ➔ ${destination}
- **Operator**: Gulf Cargo Logistics
- **Transit Time**: 19 hours (including 4.5h layover)
- **Aviation Advantage**: 15-20% lower air freight rates. High frequency flights out of Dubai Hub. Recommended if speed is not critical.`;

    default:
      return "AI action completed.";
  }
}

// Handler function for serverless route
module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Set AI mode header for system diagnostics
  res.setHeader('x-ai-type', groq ? 'groq' : 'simulated');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Only POST method is allowed" });
  }

  const { action, data } = req.body || {};

  if (!action || !data) {
    return res.status(400).json({ error: "Missing action or data in request body" });
  }

  try {
    // If Groq API Key is not configured, return high-fidelity mock response
    if (!groq) {
      const mockResult = getMockAiResponse(action, data);
      // Simulate network lag for realistic feel (400ms)
      await new Promise(resolve => setTimeout(resolve, 400));
      return res.status(200).json({ result: mockResult });
    }

    const modelName = 'llama-3.1-8b-instant';
    let systemPrompt = '';
    let userPrompt = '';

    const { origin, destination, cargo_type, weight, chargeable_weight, cargo_description } = data;

    if (action === 'quotation') {
      systemPrompt = "You are a professional air freight logistics quotation assistant. Analyze origin, destination, cargo type, actual weight, dimensions, and chargeable weight. Generate a structured, realistic air cargo quotation including estimated base rate, fuel surcharge, handling fees, security fees, and total estimated price in USD. Write in markdown, be clean, professional, and concise.";
      userPrompt = `Please generate an air cargo quotation for:
- Origin: ${origin}
- Destination: ${destination}
- Cargo Type: ${cargo_type}
- Actual Weight: ${weight} kg
- Chargeable Weight: ${chargeable_weight} kg
- Description: ${cargo_description || 'N/A'}`;
    } 
    else if (action === 'customs') {
      systemPrompt = "You are a global customs compliance officer for air cargo. Analyze the shipment details (origin, destination, cargo type) and list all mandatory shipping documents, specific customs regulations, import/export restrictions, and compliance actions required. Format as clean bullet points in markdown.";
      userPrompt = `Please generate customs information and document checklist for:
- Origin: ${origin}
- Destination: ${destination}
- Cargo Type: ${cargo_type}
- Cargo Description: ${cargo_description || 'General Merchandise'}`;
    } 
    else if (action === 'clean_description') {
      systemPrompt = "You are an air cargo cargo-description standardizer. Clean up raw, messy, or informal descriptions into professional, standardized Harmonized System (HS) compliant declarations (e.g. 'phone parts' becomes 'Electronic Components: Telecommunication Device Parts'). Do not add any conversational text. Return only the cleaned description string.";
      userPrompt = `Clean up this description: "${cargo_description}"`;
    } 
    else if (action === 'route_options') {
      systemPrompt = "You are an air cargo routing assistant. Recommend route options between the origin and destination airports. List 1-2 practical route itineraries (including hub transfers if direct flights are rare) with estimated transit times and a brief rationale for cargo efficiency. Use markdown.";
      userPrompt = `Suggest cargo flight routes from ${origin} to ${destination} for ${cargo_type} goods.`;
    } 
    else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    // Call Groq LLaMA model
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: modelName,
      temperature: 0.2,
      max_tokens: 800,
    });

    const responseContent = chatCompletion.choices[0].message.content;
    return res.status(200).json({ result: responseContent });

  } catch (error) {
    console.error("Groq API Error in ai.js:", error);
    // Fallback to mock response on failure so the app doesn't crash
    const mockResult = getMockAiResponse(action, data);
    return res.status(200).json({ 
      result: mockResult,
      warning: "Live AI failed. Returned simulated response instead.",
      errorDetails: error.message 
    });
  }
};
