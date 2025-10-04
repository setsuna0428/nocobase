/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useForm, useField } from '@formily/react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useActionContext, useAPIClient } from '@nocobase/client';
import { NAMESPACE } from '../locale';

export * from './useMSSQLConnection';

export const useCreateDatabaseServer = (handleDataServerChange) => {
  const form = useForm();
  const ctx = useActionContext();
  const api = useAPIClient();
  const { t } = useTranslation();
  const actionField = useField();
  actionField.data = actionField.data || {};
  return {
    async run() {
      await form.submit();
      try {
        actionField.data.loading = true;
        const { data } = await api.resource('databaseServers').create({
          values: {
            ...form.values,
          },
        });
        actionField.data.loading = false;
        ctx.setVisible(false);
        await form.reset();
        handleDataServerChange?.(data?.data);
        message.success(t('Saved successfully'));
      } catch (error) {
        actionField.data.loading = false;
        console.log(error);
      }
    },
  };
};

export const useTestConnectionAction = () => {
  const { t } = useTranslation();
  const apiClient = useAPIClient();
  const form = useForm();
  
  return {
    async run() {
      const values = form.values;
      
      try {
        // 根據類型調整測試連接參數
        let testParams = {
          type: values.type,
          options: values.options,
        };

        // MSSQL 特殊處理
        if (values.type === 'mssql') {
          testParams = {
            type: 'mssql',
            options: {
              ...values.options,
              dialectOptions: {
                options: {
                  trustServerCertificate: values.options?.dialectOptions?.trustServerCertificate ?? true,
                  encrypt: values.options?.dialectOptions?.encrypt ?? false,
                  connectionTimeout: values.options?.dialectOptions?.connectionTimeout || 30000,
                  enableArithAbort: true,
                },
              },
            },
          };
        }

        const response = await apiClient.request({
          resource: 'dataSources',
          action: 'testConnection',
          params: {
            values: testParams,
          },
        });

        // 修正：檢查 HTTP 狀態和回應內容
        if (response.status === 200 || response.data?.success !== false) {
          message.success(t('Test connection successful', { ns: NAMESPACE }));
        } else {
          message.error(response.data?.error || t('Test connection failed', { ns: NAMESPACE }));
        }
      } catch (error) {
        console.error('Connection test error:', error);
        message.error(error.message || t('Test connection failed', { ns: NAMESPACE }));
      }
    },
  };
};

export const useLoadCollections = () => {
  const api = useAPIClient();
  return async (key) => {
    const { data } = await api.request({
      url: `dataSources/${key}/collections:all`,
      method: 'get',
    });
    return data;
  };
};

export const addDatasourceCollections = async (api, filterByTk, options: { collections; dbOptions }) => {
  const url = `dataSources/${filterByTk}/collections:add`;
  const { collections: toBeAddedCollections, dbOptions } = options;
  if (toBeAddedCollections.length) {
    const collections = [];
    for (const { name, selected } of toBeAddedCollections) {
      if (selected) {
        collections.push(name);
      }
    }
    await api.request({
      url,
      method: 'post',
      data: {
        dbOptions,
        collections,
      },
    });
  }
};
