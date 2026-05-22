const express = require('express');
const { ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();
cors = require('cors');

app.use(cors());
app.use(express.json());


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

app.get('/pets', (req, res) => {
    res.send('Pets route');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});