const express = require('express');
const { ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();
cors = require('cors');

app.use(express.json());

app.use(cors({
    origin: "http://localhost:3000",
    credentials: true,
}));

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const run = async () => {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db("PetBuddyServer");
        const allPetsCollection = database.collection("AllPets");
        const adoptionRequestsCollection = database.collection("AdoptionRequests");


        app.get('/all-pets', async (req, res) => {
            const cursor = allPetsCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });
        app.get("/featured-pets", async (req, res) => {
            const pets = await allPetsCollection.find().limit(6).toArray();
            res.send(pets);
        });

        app.get("/all-pets/:id", async (req, res) => {
            try {
                const id = req.params.id;
                console.log("Received ID:", id);

                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ error: "Invalid ID format" });
                }

                const pet = await allPetsCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!pet) {
                    return res.status(404).json({ error: "Pet not found" });
                }

                res.json(pet);
            } catch (err) {
                console.error("Error fetching pet:", err);
                res.status(500).json({ error: "Server error" });
            }
        });

        app.get("/adoption-requests", async (req, res) => {
            try {
                const email = req.query.email;

                const result = await adoptionRequestsCollection
                    .find({ requesterEmail: email })
                    .toArray();

                res.json(result);
            } catch (err) {
                res.status(500).json({ error: "Failed to get requests" });
            }
        });

        app.get("/pets", async (req, res) => {
            try {
                const email = req.query.email;

                const query = email ? { ownerEmail: email } : {};

                const pets = await allPetsCollection.find(query).toArray();

                res.json(pets);
            } catch (error) {
                res.status(500).json({ error: "Failed to load pets" });
            }
        });

        app.get("/adoption-requests/pet/:petId", (req, res, next) => {
            const header = req.headers.authorization
            if (header === "logged in") {
                return next();
            } else {
                res.status(401).json({ error: "Unauthorized" });
            }
        }, async (req, res) => {
            try {
                const petId = req.params.petId;

                const result = await adoptionRequestsCollection
                    .find({ petId })
                    .toArray();

                res.json(result);
            } catch (err) {
                res.status(500).json({ error: "Failed to get pet requests" });
            }
        });


        app.post("/all-pets", async (req, res) => {
            try {
                const pet = req.body;
                const lastPet = await allPetsCollection
                    .find()
                    .sort({ id: -1 })
                    .limit(1)
                    .toArray();
                const nextId = lastPet.length > 0 ? lastPet[0].id + 1 : 1;
                const newPet = {
                    ...pet,
                    id: nextId,
                };
                const result = await allPetsCollection.insertOne(newPet);
                res.send({
                    success: true,
                    insertedId: result.insertedId,
                    id: nextId,
                });
            } catch (error) {
                res.status(500).send({ error: "Failed to insert pet" });
            }
        });


        app.post("/adoption-requests", async (req, res) => {
            try {
                const body = req.body;

                if (!body.petId || !body.requesterEmail) {
                    return res.status(400).send({ error: "Missing required fields" });
                }

                const adoptionRequest = {
                    petId: body.petId,
                    petName: body.petName,
                    petImage: body.petImage || "",

                    requesterName: body.requesterName,
                    requesterEmail: body.requesterEmail,

                    ownerEmail: body.ownerEmail || "",

                    message: body.message,
                    pickupDate: body.pickupDate,

                    status: "pending",
                    requestedAt: new Date(),
                    updatedAt: new Date(),
                };

                const result = await adoptionRequestsCollection.insertOne(adoptionRequest);

                res.send({
                    success: true,
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("ADOPTION ERROR:", error);
                res.status(500).send({ error: "Failed to create adoption request" });
            }
        });

        app.patch("/all-pets/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const update = req.body;
                const { name, fee, image, description } = req.body;

                const result = await allPetsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: { name, fee, image, description }
                    }
                );

                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Update failed" });
            }
        });

        app.patch("/adoption-requests/:id", async (req, res) => {
            try {
                const id = req.params.id;
                const { status, petId } = req.body;

                await adoptionRequestsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            status,
                            updatedAt: new Date(),
                        },
                    }
                );

                if (status === "approved") {
                    await allPetsCollection.updateOne(
                        { _id: new ObjectId(petId) },
                        { $set: { status: "adopted" } }
                    );
                }

                if (status === "rejected") {
                    // optional: keep available or reset logic
                }

                res.send({ success: true });
            } catch (err) {
                res.status(500).send({ error: "Failed update" });
            }
        });

        app.delete("/adoption-requests/:id", async (req, res) => {
            const id = req.params.id;
            await adoptionRequestsCollection.deleteOne({
                _id: new ObjectId(id),
            });
            res.send(result);
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hi, This Message Is From Express Server!');
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});