const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
}));

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyToken = async (req, res, next) => {
    const { authorization } = req.headers;
    const token = authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        // Use the globally defined JWKS here!
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
    } catch (error) {
        console.error('Token validation failed:', error);
        return res.status(401).json({ message: 'Unauthorized' });
    }
};

// 2. Wrap server initialization in a distinct async function
async function startServer() {
    try {
        await client.connect();
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const database = client.db("PetBuddyServer");
        const allPetsCollection = database.collection("AllPets");
        const adoptionRequestsCollection = database.collection("AdoptionRequests");

        // --- ROUTES ---

        app.get('/all-pets', async (req, res, next) => {
            try {
                const pets = await allPetsCollection.find().toArray();
                res.json(pets);
            } catch (error) {
                next(error); // Pass to global error handler
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

        // 3. Applying the extracted middleware cleanly
        app.get("/adoption-requests/pet/:petId", verifyToken, async (req, res, next) => {
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

                // Fetch highest ID to generate next ID
                const lastPet = await allPetsCollection.find().sort({ id: -1 }).limit(1).toArray();
                const nextId = lastPet.length > 0 ? lastPet[0].id + 1 : 1;

                const newPet = {
                    ...pet,
                    id: nextId,
                };

                const result = await allPetsCollection.insertOne(newPet);

                res.status(201).json({
                    success: true,
                    insertedId: result.insertedId,
                    id: nextId,
                });
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

                res.status(201).json({
                    success: true,
                    insertedId: result.insertedId,
                });
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
                    {
                        $set: {
                            status,
                            updatedAt: new Date()
                        }
                    }
                );

                // Auto-update pet status if approved
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

                const result = await adoptionRequestsCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                res.json(result);
            } catch (error) {
                next(error);
            }
        });

        app.get('/', (req, res) => {
            res.send('Hi, This Message Is From Express Server!');
        });

        // 4. Global Error Handler Middleware (Must be defined AFTER routes)
        app.use((err, req, res, next) => {
            console.error("Unhandled Error:", err);
            res.status(500).json({ error: "Internal Server Error" });
        });

        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });

    } catch (error) {
        // If DB fails to connect, log and safely crash the app
        console.error("Failed to initialize server:", error);
        process.exit(1);
    }
}

// Boot up the server
startServer();