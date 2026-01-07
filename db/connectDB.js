import dotenv from "dotenv";
import { MongoClient } from "mongodb";
dotenv.config();

const uri = process.env.MONGO_URI;

let client;
let db;

const connectDB = async () => {
    try {
        if(!client) {
            client = new MongoClient(uri);
            await client.connect();
            db = client.db();
            console.log(("MongoDB Connected"));
        }
        return db;
    } catch (error) {
        console.log("MongoDB connection failed: ", error.message);
        process.exit(1);
    }
}

export { connectDB, db };

