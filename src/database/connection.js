const { Connector } = require('@google-cloud/cloud-sql-connector');
const mysql = require('mysql2/promise');
const { logError, logInfo } = require('../utils/logger');
const config = require('../config');

class DatabaseConnection {
  constructor() {
    this.connector = new Connector();
    this.pool = null;
  }

  async initialize() {
    try {
      const clientOpts = await this.connector.getOptions({
        instanceConnectionName: config.database.connectionName,
        ipType: 'PUBLIC',
      });

      this.pool = mysql.createPool({
        ...clientOpts,
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        acquireTimeout: 60000,
        timeout: 60000,
      });

      logInfo('Database connection pool initialized', {
        connectionName: config.database.connectionName,
        database: config.database.database,
      });

      // Test the connection
      await this.testConnection();
    } catch (error) {
      logError(error, { context: 'Database initialization' });
      throw error;
    }
  }

  async testConnection() {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      logInfo('Database connection test successful');
    } catch (error) {
      logError(error, { context: 'Database connection test' });
      throw error;
    }
  }

  async query(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logError(error, { 
        context: 'Database query',
        sql: sql.substring(0, 100) + '...',
        params: params.length > 0 ? params.length : 'none'
      });
      throw error;
    }
  }

  async transaction(callback) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      logError(error, { context: 'Database transaction' });
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logInfo('Database connection pool closed');
    }
  }
}

// Singleton instance
const dbConnection = new DatabaseConnection();

module.exports = dbConnection;