/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useAPIClient, useActionContext } from '@nocobase/client';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { NAMESPACE } from '../locale';

export const useMSSQLTestConnection = () => {
  const { t } = useTranslation();
  const apiClient = useAPIClient();
  const { setVisible } = useActionContext();

  return {
    async run() {
      const { values } = this.form.values;
      
      try {
        // 調用後端 MSSQL 連接測試 API
        const response = await apiClient.request({
          resource: 'dataSources',
          action: 'testConnection',
          params: {
            values: {
              type: 'mssql',
              options: {
                host: values.options?.host,
                port: values.options?.port || 1433,
                username: values.options?.username,
                password: values.options?.password,
                database: values.options?.database,
                schema: values.options?.schema || 'dbo',
                dialectOptions: {
                  options: {
                    trustServerCertificate: values.options?.dialectOptions?.trustServerCertificate ?? true,
                    encrypt: values.options?.dialectOptions?.encrypt ?? false,
                    connectionTimeout: values.options?.dialectOptions?.connectionTimeout || 30000,
                    enableArithAbort: true,
                  },
                },
              },
            },
          },
        });

        if (response.data?.success) {
          message.success(t('Test connection successful', { ns: NAMESPACE }));
        } else {
          message.error(response.data?.error || t('Test connection failed', { ns: NAMESPACE }));
        }
      } catch (error) {
        console.error('MSSQL connection test error:', error);
        message.error(error.message || t('Test connection failed', { ns: NAMESPACE }));
      }
    },
  };
};

export const useCreateMSSQLDataSource = () => {
  const { t } = useTranslation();
  const apiClient = useAPIClient();
  const { setVisible } = useActionContext();
  const resourceContext = useResourceContext();

  return {
    async run() {
      const { values } = this.form.values;
      
      try {
        // 處理 MSSQL 特有的選項
        const mssqlValues = {
          ...values,
          type: 'mssql',
          options: {
            ...values.options,
            dialect: 'mssql',
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

        await apiClient.resource('dataSources').create({
          values: mssqlValues,
        });

        message.success(t('Created successfully'));
        setVisible(false);
        resourceContext.refresh();
      } catch (error) {
        console.error('Create MSSQL data source error:', error);
        message.error(error.message || t('Create failed'));
      }
    },
  };
};
