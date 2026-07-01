const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(express.json());

const cookieParser = (req, res, next) => {
    const rawCookies = req.headers.cookie || '';
    const cookies = {};
    rawCookies.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        if (parts.length === 2) {
            cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
        }
    });
    req.cookies = cookies;
    next();
};

app.use(cookieParser);

app.use(cors({
    origin: [
        "http://localhost:3000",
        "https://assignment-09-phi.vercel.app",
        "https://petbuddy-adopt.vercel.app"
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

const database = client.db("PetBuddyServer");
const allPetsCollection = database.collection("AllPets");
const adoptionRequestsCollection = database.collection("AdoptionRequests");

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized access" });
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: "Unauthorized access" });
        }
        req.user = decoded;
        next();
    });
};


app.get('/', (req, res) => {
    res.send('Hi, This Message Is From Express Server on Vercel!');
});

app.post("/jwt", (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }
        const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        }).json({ success: true });
    } catch (error) {
        next(error);
    }
});

app.post("/logout", (req, res, next) => {
    try {
        res.clearCookie('token', {
            httpOnly: true,
            secure: true,
            sameSite: 'none'
        }).json({ success: true });
    } catch (error) {
        next(error);
    }
});

app.get('/all-pets', async (req, res, next) => {
    try {
        const { search, species, sortBy } = req.query;

        const query = {};

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (species && species !== 'all') {
            const speciesArray = species.split(',');
            query.type = { $in: speciesArray };
        }

        let sortCriteria = {};
        if (sortBy === 'name') {
            sortCriteria = { name: 1 };
        }

        let pets = await allPetsCollection.find(query).sort(sortCriteria).toArray();

        if (sortBy === 'fee-asc') {
            pets.sort((a, b) => Number(a.fee.replace(/\D/g, "")) - Number(b.fee.replace(/\D/g, "")));
        } else if (sortBy === 'fee-desc') {
            pets.sort((a, b) => Number(b.fee.replace(/\D/g, "")) - Number(a.fee.replace(/\D/g, "")));
        }

        res.json(pets);
    } catch (error) {
        next(error);
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

app.get("/adoption-requests", verifyToken, async (req, res, next) => {
    try {
        const { email } = req.query;
        if (req.user.email !== email) {
            return res.status(403).json({ error: "Forbidden access" });
        }
        const query = email ? { requesterEmail: email } : {};
        const requests = await adoptionRequestsCollection.find(query).toArray();
        res.json(requests);
    } catch (error) {
        next(error);
    }
});

app.get("/pets", verifyToken, async (req, res, next) => {
    try {
        const { email } = req.query;
        if (req.user.email !== email) {
            return res.status(403).json({ error: "Forbidden access" });
        }
        const query = email ? { ownerEmail: email } : {};
        const pets = await allPetsCollection.find(query).toArray();
        res.json(pets);
    } catch (error) {
        next(error);
    }
});

app.get("/adoption-requests/pet/:petId", verifyToken, async (req, res, next) => {
    try {
        const { petId } = req.params;
        const requests = await adoptionRequestsCollection.find({ petId }).toArray();
        res.json(requests);
    } catch (error) {
        next(error);
    }
});

app.post("/all-pets", verifyToken, async (req, res, next) => {
    try {
        const pet = req.body;
        if (req.user.email !== pet.ownerEmail) {
            return res.status(403).json({ error: "Forbidden access" });
        }
        const lastPet = await allPetsCollection.find().sort({ id: -1 }).limit(1).toArray();
        const nextId = lastPet.length > 0 ? lastPet[0].id + 1 : 1;
        const newPet = { ...pet, id: nextId };

        const result = await allPetsCollection.insertOne(newPet);
        res.status(201).json({ success: true, insertedId: result.insertedId, id: nextId });
    } catch (error) {
        next(error);
    }
});

app.post("/adoption-requests", verifyToken, async (req, res, next) => {
    try {
        const body = req.body;
        if (!body.petId || !body.requesterEmail) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        if (req.user.email !== body.requesterEmail) {
            return res.status(403).json({ error: "Forbidden access" });
        }
        const pet = await allPetsCollection.findOne({
            _id: new ObjectId(body.petId)
        });
        if (!pet) {
            return res.status(404).json({ error: "Pet not found" });
        }
        if (pet.ownerEmail === body.requesterEmail) {
            return res.status(403).json({ error: "You cannot adopt your own pet" });
        }
        if (pet.status === "adopted") {
            return res.status(400).json({ error: "This pet has already been adopted" });
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

app.patch("/all-pets/:id", verifyToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, type, breed, age, gender, image, healthStatus, vaccinationStatus, location, fee, description } = req.body;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }
        const result = await allPetsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { name, type, breed, age, gender, image, healthStatus, vaccinationStatus, location, fee, description } }
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
});

app.patch("/adoption-requests/:id", verifyToken, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, petId } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid Request ID format" });
        }

        await adoptionRequestsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    status: status,
                    updatedAt: new Date()
                }
            }
        );

        if (status === "approved" && petId) {
            if (ObjectId.isValid(petId)) {
                await allPetsCollection.updateOne(
                    { _id: new ObjectId(petId) },
                    { $set: { status: "adopted" } }
                );
            } else {
                await allPetsCollection.updateOne(
                    { id: petId },
                    { $set: { status: "adopted" } }
                );
            }

            await adoptionRequestsCollection.updateMany(
                {
                    petId: petId,
                    _id: { $ne: new ObjectId(id) },
                    status: "pending"
                },
                {
                    $set: {
                        status: "rejected",
                        updatedAt: new Date()
                    }
                }
            );
        }

        res.json({ success: true, message: `Request successfully ${status}` });

    } catch (error) {
        next(error);
    }
});

app.delete("/adoption-requests/:id", verifyToken, async (req, res, next) => {
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

app.delete("/all-pets/:id", verifyToken, async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid ID format" });
        }

        const result = await allPetsCollection.deleteOne({
            _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Pet not found or already deleted" });
        }

        await adoptionRequestsCollection.deleteMany({
            petId: id
        });

        res.json({
            success: true,
            message: "Pet and associated requests deleted successfully"
        });

    } catch (error) {
        next(error);
    }
});

app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
});


if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
        console.log(`Local server is running on port ${port}`);
    });
}

// Vercel export
module.exports = app;