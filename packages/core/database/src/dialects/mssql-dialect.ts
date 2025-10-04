/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DataTypes } from 'sequelize';
import { BaseDialect } from './base-dialect';
import { DatabaseOptions } from '../database';

export class MSSQLDialect extends BaseDialect {
  static dialectName = 'mssql';

  getVersionGuard() {
    return {
      sql: 'SELECT @@VERSION as version',
      get: (v: string) => {
        // 解析 SQL Server 版本號
        const match = v.match(/Microsoft SQL Server (\d+)/);
        if (match) {
          const year = parseInt(match[1]);
          // 將年份轉換為版本號格式
          if (year >= 2017) return '14.0.0';
          if (year >= 2016) return '13.0.0';
          if (year >= 2014) return '12.0.0';
          if (year >= 2012) return '11.0.0';
          return '10.0.0';
        }
        return '11.0.0'; // 預設最低支援版本
      },
      version: '>=11.0.0', // SQL Server 2012+
    };
  }

  getSequelizeOptions(options: DatabaseOptions) {
    const dialectOptions = {
      ...options.dialectOptions,
      options: {
        // MSSQL 必要設定
        trustServerCertificate: true,
        enableArithAbort: true,
        encrypt: false, // 根據需求調整
        ...(options.dialectOptions as any)?.options,
      },
    };

    // 處理 MSSQL 連接字串
    const sequelizeOptions = {
      ...options,
      dialect: 'mssql' as any,
      dialectOptions,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
        ...options.pool,
      },
    };

    // MSSQL 特有的資料庫選項
    if (options.schema && options.schema !== 'dbo') {
      (sequelizeOptions as any).schema = options.schema;
    }

    return sequelizeOptions;
  }

  async checkDatabaseVersion(database: any) {
    try {
      const result = await database.sequelize.query('SELECT @@VERSION as version', { 
        type: database.sequelize.QueryTypes.SELECT 
      });
      
      const version = result[0]?.version;
      if (version) {
        console.log('MSSQL Version:', version);
        
        // 檢查最低版本要求 (SQL Server 2012+)
        const versionMatch = version.match(/Microsoft SQL Server (\d+)/);
        if (versionMatch) {
          const majorVersion = parseInt(versionMatch[1]);
          if (majorVersion < 2012) {
            console.warn('Warning: SQL Server version below 2012 may have compatibility issues');
          }
        }
      }
      
      return true;
    } catch (error) {
      throw new Error(`MSSQL version check failed: ${(error as Error).message}`);
    }
  }

  // MSSQL 特有的資料類型處理
  getDataTypeMap() {
    return {
      string: (length = 255) => DataTypes.STRING(length),
      text: () => DataTypes.TEXT,
      integer: () => DataTypes.INTEGER,
      bigint: () => DataTypes.BIGINT,
      float: () => DataTypes.FLOAT,
      decimal: (precision: number, scale: number) => DataTypes.DECIMAL(precision, scale),
      boolean: () => DataTypes.BOOLEAN,
      date: () => DataTypes.DATE,
      dateonly: () => DataTypes.DATEONLY,
      time: () => DataTypes.TIME,
      uuid: () => DataTypes.UUID,
      // MSSQL 沒有原生 JSON，使用 TEXT 模擬
      json: () => DataTypes.TEXT,
    };
  }
}
