import express, { Request, Response } from 'express';
import { Client } from 'pg';

const app = express();
const PORT = 9000;
const DATABASE_URL = "postgres://postgres:111111@localhost:5432/mydatabasepoly";

app.use(express.json());

const connectWithRetry = async (): Promise<Client | undefined> => {
    const client = new Client({ connectionString: DATABASE_URL });
    const maxRetries = 5;
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            await client.connect();
            console.log('Connected to the database');
            return client;
        } catch (err: any) {
            attempts++;
            console.error(`Connection attempt ${attempts} failed: ${err.message}`);
            if (attempts >= maxRetries) {
                console.error('Max retries reached. Exiting...');
                process.exit(1);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    return undefined;
};

const startServer = async () => {
    const client = await connectWithRetry();
    if (!client) {
        console.error('Failed to connect to the database.');
        process.exit(1);
    }

    app.post('/find-centroid', async (req: Request, res: Response) => {
        const userGeoJson: any = req.body;
        const query = `SELECT ST_AsGeoJSON(ST_Centroid(ST_GeomFromGeoJSON($1))) AS centroid`;
        try {
            const result = await client.query(query, [JSON.stringify(userGeoJson.geometry)]);
            if (result.rows.length > 0) {
                const centroid = JSON.parse(result.rows[0].centroid);
                res.json({ message: 'Centroid calculated successfully', centroid });
            } else {
                res.status(400).json({ message: 'Unable to calculate centroid' });
            }
        } catch (error) {
            console.error('Error querying the database:', error);
            res.status(500).json({ error: `Error calculating centroid: ${error.message}` });
        }
    });

    app.post('/check-intersection', async (req: Request, res: Response) => {
        const userGeoJson: any = req.body;
        const query = `SELECT ST_AsGeoJSON(geom) AS geojson FROM forest2020 WHERE ST_Intersects(ST_GeomFromGeoJSON($1), geom)`;
        try {
            const result = await client.query(query, [JSON.stringify(userGeoJson.geometry)]);
            const intersections = result.rows.map(row => JSON.parse(row.geojson));
            res.json(intersections.length > 0
                ? { message: 'The polygons intersect', intersections }
                : { message: 'The polygons do not intersect' });
        } catch (error) {
            console.error('Error querying the database:', error);
            res.status(500).json({ error: `Error checking intersection: ${error.message}` });
        }
    });

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

startServer().catch(err => console.error('Error starting server:', err));
