const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.5tt4v.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {

    try {
        await client.connect();
        const toolsCollection = client.db("manufacture").collection("products");
        const orderCollection = client.db("manufacture").collection("orders");
        const userCollection = client.db("manufacture").collection("users");

        // get all tools
        app.get('/tools', async (req, res) => {
            const query = {};
            const cursor = toolsCollection.find(query);
            const tools = await cursor.toArray();
            res.send(tools);
        })

        // get a single tool
        app.get('/tools/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const tools = await toolsCollection.findOne(query);
            res.send(tools);
        })

        // post order item
        app.post('/order', async (req, res) => {
            const purchase = req.body;
            const result = await orderCollection.insertOne(purchase);
            res.send({ success: true, result });
        })

        // get my orders
        app.get('/orders', async (req, res) => {
            const buyer = req.query.buyer;
            const query = { buyer: buyer };
            const orders = await orderCollection.find(query).toArray();
            return res.send(orders);
        })

        // update quantity
        app.put('/tools/:id', async (req, res) => {
            const purchaseProduct = req.body;
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    quantity: purchaseProduct.quantity
                }
            };
            const result = await toolsCollection.updateOne(filter, updateDoc, options);
            res.send({ success: true, result });
        })

        // put users
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token });
        })

    } finally {

    }

}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from Manufacturer website');
})

app.listen(port, () => {
    console.log('Application is running on port', port);
})