/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Application, Plugin } from '@nocobase/server';
import { resolve } from 'path';
import { DataSourcesCollectionModel } from './models/data-sources-collection-model';
import { DataSourcesFieldModel } from './models/data-sources-field-model';
import remoteCollectionsResourcer from './resourcers/data-sources-collections';
import remoteFieldsResourcer from './resourcers/data-sources-collections-fields';
import rolesConnectionResourcesResourcer from './resourcers/data-sources-resources';
import databaseConnectionsRolesResourcer from './resourcers/data-sources-roles';
import { rolesRemoteCollectionsResourcer } from './resourcers/roles-data-sources-collections';

import { DataSourceManager, LoadingProgress } from '@nocobase/data-source-manager';
import lodash from 'lodash';
import { DataSourcesRolesResourcesModel } from './models/connections-roles-resources';
import { DataSourcesRolesResourcesActionModel } from './models/connections-roles-resources-action';
import { DataSourceModel } from './models/data-source';
import { DataSourcesRolesModel } from './models/data-sources-roles-model';
import { mergeRole } from '@nocobase/acl';
import { ALLOW_MAX_COLLECTIONS_COUNT } from './constants';

type DataSourceState = 'loading' | 'loaded' | 'loading-failed' | 'reloading' | 'reloading-failed';

const canRefreshStatus = ['loaded', 'loading-failed', 'reloading-failed'];

export class PluginDataSourceManagerServer extends Plugin {
  public dataSourceErrors: {
    [dataSourceKey: string]: Error;
  } = {};

  public dataSourceStatus: {
    [dataSourceKey: string]: DataSourceState;
  } = {};

  public dataSourceLoadingProgress: {
    [dataSourceKey: string]: LoadingProgress;
  } = {};

  renderJsonTemplate(template) {
    return this.app.environment.renderJsonTemplate(template);
  }

  async handleSyncMessage(message) {
    const { type } = message;
    if (type === 'syncRole') {
      const { roleName, dataSourceKey } = message;
      const dataSource = this.app.dataSourceManager.dataSources.get(dataSourceKey);

      const dataSourceRole: DataSourcesRolesModel = await this.app.db.getRepository('dataSourcesRoles').findOne({
        filter: {
          dataSourceKey,
          roleName,
        },
      });

      await dataSourceRole.writeToAcl({
        acl: dataSource.acl,
      });
    }

    if (type === 'syncRoleResource') {
      const { roleName, dataSourceKey, resourceName } = message;
      const dataSource = this.app.dataSourceManager.dataSources.get(dataSourceKey);

      const dataSourceRoleResource: DataSourcesRolesResourcesModel = await this.app.db
        .getRepository('dataSourcesRolesResources')
        .findOne({
          filter: {
            dataSourceKey,
            roleName,
            name: resourceName,
          },
        });

      await dataSourceRoleResource.writeToACL({
        acl: dataSource.acl,
      });
    }
    if (type === 'loadDataSource') {
      const { dataSourceKey } = message;
      const dataSourceModel = await this.app.db.getRepository('dataSources').findOne({
        filter: {
          key: dataSourceKey,
        },
      });

      if (!dataSourceModel) {
        return;
      }

      await dataSourceModel.loadIntoApplication({
        app: this.app,
      });
    }

    if (type === 'loadDataSourceField') {
      const { key } = message;
      const fieldModel = await this.app.db.getRepository('dataSourcesFields').findOne({
        filter: {
          key,
        },
      });

      fieldModel.load({
        app: this.app,
      });
    }
    if (type === 'removeDataSourceCollection') {
      const { dataSourceKey, collectionName } = message;
      const dataSource = this.app.dataSourceManager.dataSources.get(dataSourceKey);
      dataSource.collectionManager.removeCollection(collectionName);
    }

    if (type === 'removeDataSourceField') {
      const { key } = message;
      const fieldModel = await this.app.db.getRepository('dataSourcesFields').findOne({
        filter: {
          key,
        },
      });

      fieldModel.unload({
        app: this.app,
      });
    }

    if (type === 'removeDataSource') {
      const { dataSourceKey } = message;
      this.app.dataSourceManager.dataSources.delete(dataSourceKey);
    }
  }

  async beforeLoad() {
    const self = this;
    
    // ========== 註冊 MSSQL 資料源類型 ==========
    this.app.dataSourceManager.factory.register('mssql', class MSSQLDataSource extends (require('@nocobase/data-source-manager').SequelizeDataSource) {
      static async testConnection(options: any) {
        const { Database } = require('@nocobase/database');
        
        // 處理 MSSQL 連接選項
        const mssqlOptions = {
          ...options,
          dialect: 'mssql',
          logging: false,
          dialectOptions: {
            options: {
              trustServerCertificate: true,
              enableArithAbort: true,
              encrypt: false,
            },
            ...options.dialectOptions,
          },
        };

        try {
          const testDb = new Database(mssqlOptions);
          await testDb.auth();
          
          // 測試查詢功能
          await testDb.sequelize.query('SELECT 1 as test', { 
            type: testDb.sequelize.QueryTypes.SELECT 
          });
          
          await testDb.close();
          
          return { success: true, message: 'MSSQL connection test passed' };
        } catch (error) {
          throw new Error(`MSSQL connection test failed: ${error.message}`);
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
    });

    this.app.db.registerModels({
      DataSourcesCollectionModel,
      DataSourcesFieldModel,
      DataSourcesRolesModel,
      DataSourcesRolesResourcesModel,
      DataSourcesRolesResourcesActionModel,
      DataSourceModel,
    });

    // 現有的事件監聽器設置...
    this.app.db.on('dataSourcesFields.beforeCreate', async (model, options) => {
      const validatePresent = (name: string) => {
        if (!model.get(name)) {
          throw new Error(`"${name}" is required`);
        }
      };

      const validatePresents = (names: string[]) => {
        names.forEach((name) => validatePresent(name));
      };

      const type = model.get('type');

      if (type === 'belongsTo') {
        validatePresents(['foreignKey', 'targetKey', 'target']);
      }

      if (type === 'hasMany') {
        validatePresents(['foreignKey', 'sourceKey', 'target']);
      }

      if (type == 'hasOne') {
        validatePresents(['foreignKey', 'sourceKey', 'target']);
      }

      if (type === 'belongsToMany') {
        validatePresents(['foreignKey', 'otherKey', 'sourceKey', 'targetKey', 'through', 'target']);
      }
    });

    // 其他現有的事件監聽器...
    this.app.db.on('dataSources.beforeCreate', async (model: DataSourceModel, options) => {
      this.dataSourceStatus[model.get('key')] = 'loading';
    });

    this.app.db.on('dataSources.beforeSave', async (model: DataSourceModel) => {
      if (model.changed('options') && !model.isMainRecord()) {
        const dataSourceOptions = model.get('options');
        const type = model.get('type');

        const klass = this.app.dataSourceManager.factory.getClass(type);

        if (!klass) {
          throw new Error(`Data source type "${type}" is not registered`);
        }

        try {
          await klass.testConnection(this.renderJsonTemplate(dataSourceOptions || {}));
        } catch (error) {
          throw new Error(`Test connection failed: ${error.message}`);
        }
      }
    });

    // ========== 添加 Actions ==========
    const plugin = this;

    const mapDataSourceWithCollection = (dataSourceModel, appendCollections = true) => {
      const dataSource = this.app.dataSourceManager.dataSources.get(dataSourceModel.get('key'));
      const dataSourceStatus = plugin.dataSourceStatus[dataSourceModel.get('key')];

      const item: any = {
        key: dataSourceModel.get('key'),
        displayName: dataSourceModel.get('displayName'),
        status: dataSourceStatus,
        type: dataSourceModel.get('type'),
        isDBInstance: !!dataSource?.collectionManager.db,
      };

      const publicOptions = dataSource?.publicOptions();
      if (publicOptions) {
        item['options'] = publicOptions;
      }

      if (dataSourceStatus === 'loading-failed' || dataSourceStatus === 'reloading-failed') {
        item['errorMessage'] = plugin.dataSourceErrors[dataSourceModel.get('key')].message;
      }

      if (!dataSource) {
        return item;
      }

      if (appendCollections) {
        const collections = dataSource.collectionManager.getCollections();

        item.collections = collections.map((collection) => {
          const collectionOptions = collection.options;
          const collectionInstance = dataSource.collectionManager.getCollection(collectionOptions.name);

          const fields = [...collection.fields.values()].map((field) => field.options);

          const results = {
            ...collectionOptions,
            fields,
          };

          if (collectionInstance && collectionInstance.availableActions) {
            results['availableActions'] = collectionInstance.availableActions();
          }

          if (collectionInstance && collectionInstance.unavailableActions) {
            results['unavailableActions'] = collectionInstance.unavailableActions();
          }

          return results;
        });
      }

      return item;
    };

    this.app.actions({
      async ['dataSources:listEnabled'](ctx, next) {
        const dataSources = await ctx.db.getRepository('dataSources').find({
          filter: {
            enabled: true,
            'type.$ne': 'main',
          },
        });

        ctx.body = dataSources.map((dataSourceModel) => {
          return mapDataSourceWithCollection(dataSourceModel);
        });

        await next();
      },

      async ['dataSources:testConnection'](ctx, next) {
        const { values } = ctx.action.params;
        const { options, type } = values;

        const klass = ctx.app.dataSourceManager.factory.getClass(type);

        if (!klass) {
          throw new Error(`Data source type "${type}" is not supported`);
        }

        try {
          // 對 MSSQL 進行特殊處理
          if (type === 'mssql') {
            const { Database } = require('@nocobase/database');
            
            // 使用 MSSQL 特有的連接選項
            const mssqlOptions = {
              ...self.renderJsonTemplate(options),
              dialect: 'mssql',
              logging: false,
              dialectOptions: {
                options: {
                  trustServerCertificate: true,
                  enableArithAbort: true,
                  encrypt: false, // 根據實際需求調整
                },
                ...self.renderJsonTemplate(options).dialectOptions,
              },
            };

            // 創建測試資料庫連接
            const testDb = new Database(mssqlOptions);
            await testDb.auth();
            await testDb.close();
            
            ctx.body = {
              success: true,
              message: 'MSSQL connection successful',
            };
          } else {
            // 其他資料庫類型的測試連接
            await klass.testConnection(self.renderJsonTemplate(options));
            ctx.body = {
              success: true,
            };
          }
        } catch (error) {
          throw new Error(`Test connection failed: ${error.message}`);
        }

        await next();
      },

      async ['dataSources:refresh'](ctx, next) {
        const { filterByTk, clientStatus } = ctx.action.params;

        const dataSourceModel: DataSourceModel = await ctx.db.getRepository('dataSources').findOne({
          filter: {
            key: filterByTk,
          },
        });

        const currentStatus = plugin.dataSourceStatus[filterByTk];

        if (
          canRefreshStatus.includes(currentStatus) &&
          (clientStatus ? clientStatus && canRefreshStatus.includes(clientStatus) : true)
        ) {
          dataSourceModel.loadIntoApplication({
            app: ctx.app,
            refresh: true,
          });

          ctx.app.syncMessageManager.publish(self.name, {
            type: 'loadDataSource',
            dataSourceKey: dataSourceModel.get('key'),
          });
        }

        ctx.body = {
          status: plugin.dataSourceStatus[filterByTk],
        };

        await next();
      },
    });

    this.app.resourcer.define(remoteCollectionsResourcer);
    this.app.resourcer.define(remoteFieldsResourcer);
    this.app.resourcer.define(rolesRemoteCollectionsResourcer);
    this.app.resourcer.define(databaseConnectionsRolesResourcer);
    this.app.resourcer.define(rolesConnectionResourcesResourcer);

    this.app.resourcer.define({
      name: 'dataSources',
    });

    this.app.acl.registerSnippet({
      name: `pm.data-source-manager`,
      actions: [
        'dataSources:*',
        'dataSources.collections:*',
        'dataSourcesCollections.fields:*',
        'roles.dataSourceResources',
      ],
    });

    this.app.acl.allow('dataSources', 'listEnabled', 'loggedIn');
    this.app.acl.allow('dataSources', 'get', 'loggedIn');

    this.app.acl.addFixedParams('dataSources', 'destroy', () => {
      return {
        filter: {
          'key.$ne': 'main',
        },
      };
    });
  }

  async load() {
    await this.importCollections(resolve(__dirname, 'collections'));
  }
}

export default PluginDataSourceManagerServer;
