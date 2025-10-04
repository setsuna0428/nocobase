/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DataSource } from '@nocobase/database';

export const useMSSQLConnection = () => {
  return {
    async testConnection(options) {
      const { host, port, username, password, database, schema = 'dbo' } = options;
      
      try {
        // 使用 Sequelize 進行連接測試
        const { Sequelize } = require('sequelize');
        
        const sequelize = new Sequelize(database, username, password, {
          host,
          port: port || 1433,
          dialect: 'mssql',
          dialectOptions: {
            options: {
              trustServerCertificate: true,
              encrypt: false,
              enableArithAbort: true,
            },
          },
          logging: false, // 測試時不顯示 SQL 日誌
          pool: {
            max: 1,
            min: 0,
            acquire: 30000,
            idle: 10000,
          },
        });
        
        // 測試連接
        await sequelize.authenticate();
        
        // 測試基本查詢
        await sequelize.query(`SELECT SCHEMA_NAME() AS current_schema`);
        
        // 關閉連接
        await sequelize.close();
        
        return { success: true };
      } catch (error) {
        console.error('MSSQL Connection test failed:', error);
        throw new Error(`連接失敗: ${error.message}`);
      }
    },
    
    async createDataSource(key, options) {
      const { host, port, username, password, database, schema = 'dbo' } = options;
      
      try {
        // 創建 NocoBase DataSource 配置
        const config = {
          dialect: 'mssql',
          host,
          port: port || 1433,
          username,
          password,
          database,
          dialectOptions: {
            options: {
              trustServerCertificate: true,
              encrypt: false,
              enableArithAbort: true,
            },
          },
          define: {
            schema,
          },
          pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000,
          },
          logging: false, // 生產環境建議關閉，開發時可設為 console.log
        };
        
        // 創建 NocoBase 資料源實例
        const dataSource = new DataSource({
          name: key,
          ...config,
        });
        
        // 初始化連接
        await dataSource.authenticate();
        
        console.log(`MSSQL DataSource ${key} created successfully`);
        
        return dataSource;
      } catch (error) {
        console.error(`MSSQL DataSource creation failed for ${key}:`, error);
        throw new Error(`資料源創建失敗: ${error.message}`);
      }
    },
    
    async loadCollections(dataSource, options = {}) {
      try {
        const { schema = 'dbo' } = options;
        
        console.log(`Loading collections for MSSQL schema: ${schema}`);
        
        // 查詢資料庫中的所有表
        const [tables] = await dataSource.sequelize.query(`
          SELECT 
            t.TABLE_NAME,
            t.TABLE_TYPE,
            ISNULL(
              (SELECT value FROM sys.extended_properties ep 
               WHERE ep.major_id = OBJECT_ID(QUOTENAME('${schema}') + '.' + QUOTENAME(t.TABLE_NAME)) 
               AND ep.minor_id = 0 
               AND ep.name = 'MS_Description'), 
              t.TABLE_NAME
            ) AS TABLE_COMMENT
          FROM INFORMATION_SCHEMA.TABLES t
          WHERE t.TABLE_SCHEMA = '${schema}'
            AND t.TABLE_TYPE = 'BASE TABLE'
          ORDER BY t.TABLE_NAME
        `);
        
        console.log(`Found ${tables.length} tables in schema ${schema}`);
        
        const collections = [];
        
        for (const table of tables) {
          try {
            // 查詢表的欄位信息
            const [columns] = await dataSource.sequelize.query(`
              SELECT 
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.IS_NULLABLE,
                c.COLUMN_DEFAULT,
                c.CHARACTER_MAXIMUM_LENGTH,
                c.NUMERIC_PRECISION,
                c.NUMERIC_SCALE,
                ISNULL(
                  (SELECT value FROM sys.extended_properties ep 
                   WHERE ep.major_id = OBJECT_ID(QUOTENAME('${schema}') + '.' + QUOTENAME(c.TABLE_NAME))
                   AND ep.minor_id = COLUMNPROPERTY(ep.major_id, c.COLUMN_NAME, 'ColumnId')
                   AND ep.name = 'MS_Description'), 
                  ''
                ) AS COLUMN_COMMENT
              FROM INFORMATION_SCHEMA.COLUMNS c
              WHERE c.TABLE_SCHEMA = '${schema}' 
                AND c.TABLE_NAME = '${table.TABLE_NAME}'
              ORDER BY c.ORDINAL_POSITION
            `);
            
            collections.push({
              name: table.TABLE_NAME,
              title: table.TABLE_COMMENT || table.TABLE_NAME,
              tableName: table.TABLE_NAME,
              schema: schema,
              fields: columns.map(col => ({
                name: col.COLUMN_NAME,
                type: this.mapMSSQLTypeToNocoBase(col.DATA_TYPE),
                allowNull: col.IS_NULLABLE === 'YES',
                defaultValue: col.COLUMN_DEFAULT,
                comment: col.COLUMN_COMMENT || '',
                length: col.CHARACTER_MAXIMUM_LENGTH,
                precision: col.NUMERIC_PRECISION,
                scale: col.NUMERIC_SCALE,
              })),
            });
          } catch (fieldError) {
            console.error(`Error loading fields for table ${table.TABLE_NAME}:`, fieldError);
            // 即使某個表的欄位載入失敗，也要繼續處理其他表
            collections.push({
              name: table.TABLE_NAME,
              title: table.TABLE_COMMENT || table.TABLE_NAME,
              tableName: table.TABLE_NAME,
              schema: schema,
              fields: [],
              error: fieldError.message,
            });
          }
        }
        
        console.log(`Successfully loaded ${collections.length} collections`);
        return collections;
      } catch (error) {
        console.error('Failed to load MSSQL collections:', error);
        throw new Error(`載入集合失敗: ${error.message}`);
      }
    },
    
    // 映射 MSSQL 資料類型到 NocoBase 類型
    mapMSSQLTypeToNocoBase(mssqlType) {
      const typeMap = {
        // 整數類型
        'int': 'integer',
        'bigint': 'bigInteger',
        'smallint': 'integer',
        'tinyint': 'integer',
        'bit': 'boolean',
        
        // 小數類型
        'decimal': 'decimal',
        'numeric': 'decimal',
        'money': 'decimal',
        'smallmoney': 'decimal',
        'float': 'float',
        'real': 'float',
        
        // 日期時間類型
        'datetime': 'date',
        'datetime2': 'date',
        'smalldatetime': 'date',
        'date': 'dateOnly',
        'time': 'time',
        'datetimeoffset': 'date',
        
        // 字符串類型
        'char': 'string',
        'varchar': 'string',
        'text': 'text',
        'nchar': 'string',
        'nvarchar': 'string',
        'ntext': 'text',
        
        // 二進制類型
        'binary': 'blob',
        'varbinary': 'blob',
        'image': 'blob',
        
        // 其他類型
        'uniqueidentifier': 'uuid',
        'xml': 'json',
        'sql_variant': 'json',
      };
      
      const normalizedType = mssqlType.toLowerCase();
      return typeMap[normalizedType] || 'string';
    },
  };
};
