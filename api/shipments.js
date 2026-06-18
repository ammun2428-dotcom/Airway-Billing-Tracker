const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project-id')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase client initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
  }
} else {
  console.warn("Supabase credentials missing or default. Falling back to local JSON database.");
}

// Local JSON Database Fallback Path
const FALLBACK_DB_PATH = path.join(process.cwd(), 'shipments_db.json');

// Helper to read local database
function readLocalDb() {
  try {
    if (!fs.existsSync(FALLBACK_DB_PATH)) {
      fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify([], null, 2));
      return [];
    }
    const data = fs.readFileSync(FALLBACK_DB_PATH, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error("Error reading local database:", error);
    return [];
  }
}

// Helper to write local database
function writeLocalDb(data) {
  try {
    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing to local database:", error);
  }
}

// Helper: Calculate Chargeable Weight
// Formula: Max of actual weight and dimensional weight
// Dimensional Weight = (Length * Width * Height) in cm / 6000
function calculateChargeableWeight(actualWeight, dimensionsStr) {
  const actual = parseFloat(actualWeight) || 0;
  if (!dimensionsStr) return actual;

  // Expecting format like "100x80x50" or "100 x 80 x 50"
  const parts = dimensionsStr.toLowerCase().replace(/\s/g, '').split('x');
  if (parts.length === 3) {
    const l = parseFloat(parts[0]) || 0;
    const w = parseFloat(parts[1]) || 0;
    const h = parseFloat(parts[2]) || 0;
    const dimensionalWeight = (l * w * h) / 6000;
    return Math.max(actual, parseFloat(dimensionalWeight.toFixed(2)));
  }
  return actual;
}

// Handler function for serverless route
module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  
  // Set database mode header for system diagnostics
  res.setHeader('x-database-type', supabase ? 'supabase' : 'local');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { method } = req;
  const { id } = req.query || {};

  try {
    // ----------------------------------------------------
    // GET: List all shipments or find a single shipment
    // ----------------------------------------------------
    if (method === 'GET') {
      if (supabase) {
        let query = supabase.from('shipments').select('*');
        if (id) {
          query = query.eq('id', id).single();
        } else {
          query = query.order('created_at', { ascending: false });
        }
        
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json(data);
      } else {
        const localData = readLocalDb();
        if (id) {
          const item = localData.find(s => s.id === id);
          if (!item) return res.status(404).json({ error: "Shipment not found" });
          return res.status(200).json(item);
        }
        // Return sorted by created_at descending
        const sortedLocal = [...localData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return res.status(200).json(sortedLocal);
      }
    }

    // ----------------------------------------------------
    // POST: Create a new Airway Bill shipment
    // ----------------------------------------------------
    if (method === 'POST') {
      const body = req.body;
      if (!body.awb_number || !body.sender_name || !body.receiver_name) {
        return res.status(400).json({ error: "Missing required fields (AWB number, sender, receiver)" });
      }

      const weight = parseFloat(body.weight) || 0;
      const chargeableWeight = calculateChargeableWeight(weight, body.dimensions);

      // Determine initial status based on documents
      const docsSubmitted = body.has_invoice && body.has_packing_list && body.has_id_proof && body.has_cargo_declaration;
      const initialStatus = docsSubmitted ? 'Documents Complete' : 'Pending Documents';

      const newShipment = {
        awb_number: body.awb_number.toUpperCase().trim(),
        sender_name: body.sender_name.trim(),
        receiver_name: body.receiver_name.trim(),
        origin: body.origin ? body.origin.toUpperCase().trim() : '',
        destination: body.destination ? body.destination.toUpperCase().trim() : '',
        cargo_type: body.cargo_type || 'General',
        cargo_description: body.cargo_description || '',
        weight: weight,
        dimensions: body.dimensions ? body.dimensions.trim() : '',
        chargeable_weight: chargeableWeight,
        has_invoice: !!body.has_invoice,
        has_packing_list: !!body.has_packing_list,
        has_id_proof: !!body.has_id_proof,
        has_cargo_declaration: !!body.has_cargo_declaration,
        status: body.status || initialStatus,
      };

      if (supabase) {
        const { data, error } = await supabase
          .from('shipments')
          .insert([newShipment])
          .select();
        if (error) {
          if (error.code === '23505') {
            return res.status(400).json({ error: `Airway Bill number '${newShipment.awb_number}' already exists.` });
          }
          throw error;
        }
        return res.status(201).json(data[0]);
      } else {
        const localData = readLocalDb();
        // Check uniqueness
        if (localData.some(s => s.awb_number === newShipment.awb_number)) {
          return res.status(400).json({ error: `Airway Bill number '${newShipment.awb_number}' already exists.` });
        }

        const mockId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const createdRecord = {
          id: mockId,
          ...newShipment,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        localData.push(createdRecord);
        writeLocalDb(localData);
        return res.status(201).json(createdRecord);
      }
    }

    // ----------------------------------------------------
    // PUT: Update shipment metadata, status, or documents
    // ----------------------------------------------------
    if (method === 'PUT') {
      const body = req.body;
      const updateId = id || body.id;

      if (!updateId) {
        return res.status(400).json({ error: "Missing shipment ID for update" });
      }

      // Calculate weight again if weight or dimensions are being updated
      let updateFields = { ...body };
      delete updateFields.id;
      delete updateFields.created_at;

      updateFields.updated_at = new Date().toISOString();

      if ('weight' in updateFields || 'dimensions' in updateFields) {
        // We might need to fetch the existing record first to get fields we don't have
        let currentWeight = updateFields.weight;
        let currentDimensions = updateFields.dimensions;

        if (currentWeight === undefined || currentDimensions === undefined) {
          let existingRecord = null;
          if (supabase) {
            const { data } = await supabase.from('shipments').select('*').eq('id', updateId).single();
            existingRecord = data;
          } else {
            existingRecord = readLocalDb().find(s => s.id === updateId);
          }

          if (existingRecord) {
            if (currentWeight === undefined) currentWeight = existingRecord.weight;
            if (currentDimensions === undefined) currentDimensions = existingRecord.dimensions;
          }
        }

        updateFields.chargeable_weight = calculateChargeableWeight(currentWeight, currentDimensions);
      }

      // Automatically advance status if all documents are present and it was "Pending Documents"
      if ('has_invoice' in updateFields || 'has_packing_list' in updateFields || 'has_id_proof' in updateFields || 'has_cargo_declaration' in updateFields) {
        let existingRecord = null;
        if (supabase) {
          const { data } = await supabase.from('shipments').select('*').eq('id', updateId).single();
          existingRecord = data;
        } else {
          existingRecord = readLocalDb().find(s => s.id === updateId);
        }

        if (existingRecord) {
          const hasInv = 'has_invoice' in updateFields ? !!updateFields.has_invoice : existingRecord.has_invoice;
          const hasPack = 'has_packing_list' in updateFields ? !!updateFields.has_packing_list : existingRecord.has_packing_list;
          const hasId = 'has_id_proof' in updateFields ? !!updateFields.has_id_proof : existingRecord.has_id_proof;
          const hasDecl = 'has_cargo_declaration' in updateFields ? !!updateFields.has_cargo_declaration : existingRecord.has_cargo_declaration;

          const docsSubmitted = hasInv && hasPack && hasId && hasDecl;
          const currentStatus = 'status' in updateFields ? updateFields.status : existingRecord.status;

          if (docsSubmitted && currentStatus === 'Pending Documents') {
            updateFields.status = 'Documents Complete';
          } else if (!docsSubmitted && currentStatus === 'Documents Complete') {
            updateFields.status = 'Pending Documents';
          }
        }
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('shipments')
          .update(updateFields)
          .eq('id', updateId)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ error: "Shipment not found" });
        return res.status(200).json(data[0]);
      } else {
        const localData = readLocalDb();
        const index = localData.findIndex(s => s.id === updateId);
        if (index === -1) return res.status(404).json({ error: "Shipment not found" });

        const updatedRecord = {
          ...localData[index],
          ...updateFields,
          updated_at: new Date().toISOString()
        };

        localData[index] = updatedRecord;
        writeLocalDb(localData);
        return res.status(200).json(updatedRecord);
      }
    }

    // ----------------------------------------------------
    // DELETE: Remove a shipment booking
    // ----------------------------------------------------
    if (method === 'DELETE') {
      const deleteId = id || req.body.id;
      if (!deleteId) {
        return res.status(400).json({ error: "Missing shipment ID for deletion" });
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('shipments')
          .delete()
          .eq('id', deleteId)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ error: "Shipment not found" });
        return res.status(200).json({ message: "Shipment deleted successfully", id: deleteId });
      } else {
        const localData = readLocalDb();
        const filteredData = localData.filter(s => s.id !== deleteId);
        if (filteredData.length === localData.length) {
          return res.status(404).json({ error: "Shipment not found" });
        }
        writeLocalDb(filteredData);
        return res.status(200).json({ message: "Shipment deleted successfully", id: deleteId });
      }
    }

    // Unhandled method
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).json({ error: `Method ${method} Not Allowed` });

  } catch (error) {
    console.error("API Error in shipments.js:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};
