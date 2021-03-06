const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.5tt4v.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized Access!' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access!' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {

    try {
        await client.connect();
        const toolsCollection = client.db("manufacture").collection("products");
        const orderCollection = client.db("manufacture").collection("orders");
        const userCollection = client.db("manufacture").collection("users");
        const paymentCollection = client.db("manufacture").collection("payments");
        const reviewCollection = client.db("manufacture").collection("reviews");

        // live server = https://warm-badlands-89988.herokuapp.com/
        // admin verification check
        const verifyAdmin = async (req, res, next) => {
            const initiator = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: initiator });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'Forbidden!' });
            }
        }

        // stripe payment intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const order = req.body;
            const price = order.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        // get all tools from tools collection
        app.get('/tools', async (req, res) => {
            const query = {};
            const cursor = toolsCollection.find(query);
            const tools = await cursor.toArray();
            res.send(tools);
        })
        // get all orders from order collection
        app.get('/orders', async (req, res) => {
            const query = {};
            const cursor = orderCollection.find(query);
            const orders = await cursor.toArray();
            res.send(orders);
        })

        // post tools in tools collection
        app.post('/tools', verifyJWT, verifyAdmin, async (req, res) => {
            const tools = req.body;
            const result = await toolsCollection.insertOne(tools);
            res.send(result);
        });

        // delete products from tools collection
        app.delete('/tool/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await toolsCollection.deleteOne(query);
            res.send(result);
        })


        // get a single tool from tools collection
        app.get('/tools/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const tools = await toolsCollection.findOne(query);
            res.send(tools);
        })

        // post order item in order collection
        app.post('/order', async (req, res) => {
            const purchase = req.body;
            const result = await orderCollection.insertOne(purchase);
            res.send({ success: true, result });
        })

        // update order paid status
        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedOrder);
        })

        // update order shipped status
        app.patch('/shipped/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: 'approved'
                }
            }

            const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedOrder);
        })

        // get my orders from order collection
        app.get('/my-orders', verifyJWT, async (req, res) => {
            const buyer = req.query.buyer;
            const decodedEmail = req.decoded.email;
            if (buyer === decodedEmail) {
                const query = { buyer: buyer };
                const orders = await orderCollection.find(query).toArray();
                return res.send(orders);
            }
            else {
                return res.status(403).send({ message: 'forbidden Access!' });
            }
        })

        // get a single order from order collection
        app.get('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const order = await orderCollection.findOne(query);
            res.send(order);
        })

        // update quantity in tools collection
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

        // put users to user collection
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.send({ result, token });
        })

        // get all users from user collection
        app.get('/users', async (req, res) => {
            const cursor = userCollection.find({});
            const users = await cursor.toArray();
            res.send(users);
        });
        // get single user from user collection
        app.get('/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            res.send(user);
        });

        // find admin from user collection
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // put user role to make admin in user collection
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })
        // put user information to update user info in user collection
        app.put('/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            console.log(user);
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    location: user.location,
                    image: user.image,
                    phone: user.phone,
                    education: user.education,
                    link: user.profile
                },
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        // delete order
        app.delete('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        })

        // post review in review collection
        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send({ success: true, result });
        })

        // get all reviews from review collection
        app.get('/reviews', async (req, res) => {
            const cursor = reviewCollection.find({});
            const reviews = await cursor.toArray();
            res.send(reviews);
        });

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