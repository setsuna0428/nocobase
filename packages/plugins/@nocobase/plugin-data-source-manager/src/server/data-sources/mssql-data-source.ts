/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SequelizeDataSource } from '@nocobase/data-source-manager';
import { Database } from '@nocobase/database';
import { QueryTypes } from 'sequelize';

export class MSSQLDataSource extends SequelizeDataSource {
  static async testConnection(options?: any): Promise<boolean> {
    // 處理 MSSQL 連接選項
    const mssqlOptions = {
      ...options,
      dialect: 'mssql',
      logging: false,
      dialectOptions: {
        options: {
          trustServerCertificate: true,
          enableArithAbort: true,
          encrypt: false, // 根據實際需求調整
        },
        ...options?.dialectOptions,
      },
    };

    try {
      const testDb = new Database(mssqlOptions);
      
      // 測試基本連接
      await testDb.auth();
      
      // 測試查詢功能
      await testDb.sequelize.query('SELECT 1 as test', { 
        type: QueryTypes.SELECT 
      });
      
      await testDb.close();
      
      return true;
    } catch (error) {
      throw new Error(`MSSQL connection test failed: ${(error as Error).message}`);
    }
  }

  async load() {
    // 確保 MSSQL 特有的設置
    if (!this.options.dialectOptions) {
      this.options.dialectOptions = {};
    }

    if (!this.options.dialectOptions.options) {
      this.options.dialectOptions.options = {};
    }

    // 設置 MSSQL 預設選項
    this.options.dialectOptions.options = {
      trustServerCertificate: true,
      enableArithAbort: true,
      encrypt: false,
      ...this.options.dialectOptions.options,
    };

    return await super.load();
  }
}
