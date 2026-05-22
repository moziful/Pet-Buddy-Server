const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- 1. MIDDLEWARE ---
app.use(express.json());

app.use(cors({
    origin: [
        "http://localhost:3000",
        "https://assignment-09-phi.vercel.app" // Removed trailing slash!
    ],
    credentials: true,
}));

// --- 2. DATABASE ---
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Define collections synchronously in the global scope
const database = client.db("PetBuddyServer");
const allPetsCollection = database.collection("AllPets");
const adoptionRequestsCollection = database.collection("AdoptionRequests");

// --- 3. ROUTES (Defined without an async wrapper) ---

app.get('/', (req, res) => {
    res.send('Hi, This Message Is From Express Server on Vercel!');
});

app.get('/all-pets', async (req, res, next) => {
    try {
        const pets = await allPetsCollection.find().toArray();
        res.json(pets);
    } catch (error) {
        next(error); // Passes to global error handler
    }
});

app.get("/featured-pets", async (req, res, next) => {
    try {
        const pets = await allPetsCollection.find().limit(6).toArray();
        res.json(pets);
    } catch (error) {
        next(error);
    }
});

app.get("/all-pets/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }
        const pet = await allPetsCollection.findOne({ _id: new ObjectId(id) });
        if (!pet) {
            return res.status(404).json({ error: "Pet not found" });
        }
        res.json(pet);
    } catch (error) {
        next(error);
    }
});

app.get("/adoption-requests", async (req, res, next) => {
    try {
        const { email } = req.query;
        const query = email ? { requesterEmail: email } : {};
        const requests = await adoptionRequestsCollection.find(query).toArray();
        res.json(requests);
    } catch (error) {
        next(error);
    }
});

app.get("/pets", async (req, res, next) => {
    try {
        const { email } = req.query;
        const query = email ? { ownerEmail: email } : {};
        const pets = await allPetsCollection.find(query).toArray();
        res.json(pets);
    } catch (error) {
        next(error);
    }
});

app.get("/adoption-requests/pet/:petId", async (req, res, next) => {
    try {
        const { petId } = req.params;
        const requests = await adoptionRequestsCollection.find({ petId }).toArray();
        res.json(requests);
    } catch (error) {
        next(error);
    }
});

app.post("/all-pets", async (req, res, next) => {
    try {
        const pet = req.body;
        const lastPet = await allPetsCollection.find().sort({ id: -1 }).limit(1).toArray();
        const nextId = lastPet.length > 0 ? lastPet[0].id + 1 : 1;
        const newPet = { ...pet, id: nextId };

        const result = await allPetsCollection.insertOne(newPet);
        res.status(201).json({ success: true, insertedId: result.insertedId, id: nextId });
    } catch (error) {
        next(error);
    }
});

app.post("/adoption-requests", async (req, res, next) => {
    try {
        const body = req.body;
        if (!body.petId || !body.requesterEmail) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        const adoptionRequest = {
            ...body,
            status: "pending",
            requestedAt: new Date(),
            updatedAt: new Date(),
        };
        const result = await adoptionRequestsCollection.insertOne(adoptionRequest);
        res.status(201).json({ success: true, insertedId: result.insertedId });
    } catch (error) {
        next(error);
    }
});

app.patch("/all-pets/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, fee, image, description } = req.body;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }
        const result = await allPetsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { name, fee, image, description } }
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
});

app.patch("/adoption-requests/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, petId } = req.body;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        await adoptionRequestsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status, updatedAt: new Date() } }
        );

        if (status === "approved" && petId && ObjectId.isValid(petId)) {
            await allPetsCollection.updateOne(
                { _id: new ObjectId(petId) },
                { $set: { status: "adopted" } }
            );
        }
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

app.delete("/adoption-requests/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }
        const result = await adoptionRequestsCollection.deleteOne({ _id: new ObjectId(id) });
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// --- 4. GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
});

// --- 5. LOCAL DEVELOPMENT LISTENER ---
// Vercel ignores this block, but it keeps your local `npm run dev` working perfectly.
if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
        console.log(`Local server is running on port ${port}`);
    });
}

// --- 6. VERCEL EXPORT ---
module.exports = app;