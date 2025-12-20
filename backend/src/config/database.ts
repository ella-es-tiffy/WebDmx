import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database Configuration
 */
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'dmx_user',
    password: process.env.DB_PASSWORD || 'dmx_pass',
    database: process.env.DB_NAME || 'dmx',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

/**
 * Database Connection Pool
 */
export class Database {
    private static pool: mysql.Pool;

    /**
     * Get database connection pool
     */
    public static getPool(): mysql.Pool {
        if (!Database.pool) {
            Database.pool = mysql.createPool(dbConfig);
            console.log('Database connection pool created');
        }
        return Database.pool;
    }

    /**
     * Test database connection
     */
    public static async testConnection(): Promise<boolean> {
        try {
            const pool = Database.getPool();
            const connection = await pool.getConnection();
            console.log('Database connection successful');
            connection.release();
            return true;
        } catch (error) {
            console.error('Database connection failed:', error);
            return false;
        }
    }

    /**
     * Close all connections
     */
    public static async close(): Promise<void> {
        if (Database.pool) {
            await Database.pool.end();
            console.log('Database connections closed');
        }
    }
}
