'use strict';

import Sequelize from 'sequelize';
const { Model } = Sequelize;
import { sequelize } from '../database';

import datalayer from '../../datalayer';

import {
  getDefaultOrganizationList,
  serverAvailable,
} from '../../utils/data-loaders';

import Debug from 'debug';
Debug.enable('climate-warehouse:organizations');
const log = Debug('climate-warehouse:organizations');

import ModelTypes from './organizations.modeltypes.cjs';

class Organization extends Model {
  static async getHomeOrg() {
    const myOrganization = await Organization.findOne({
      attributes: ['orgUid', 'name', 'icon'],
      where: { isHome: true },
      raw: true,
    });

    if (myOrganization) {
      return myOrganization;
    }

    return undefined;
  }

  static async getOrgsMap() {
    const organizations = await Organization.findAll({
      attributes: ['orgUid', 'name', 'icon', 'isHome', 'subscribed'],
    });

    return organizations.reduce((map, current) => {
      map[current.orgUid] = current.dataValues;
      return map;
    }, {});
  }

  static async createHomeOrganization(name, icon, dataVersion = 'v1') {
    const myOrganization = await Organization.getHomeOrg();

    if (myOrganization) {
      return myOrganization.orgUid;
    }

    const newOrganizationId =
      process.env.USE_SIMULATOR === 'true'
        ? 'f1c54511-865e-4611-976c-7c3c1f704662'
        : await datalayer.createDataLayerStore();

    const newRegistryId = await datalayer.createDataLayerStore();
    const registryVersionId = await datalayer.createDataLayerStore();

    const revertOrganizationIfFailed = async () => {
      await Organization.destroy({ where: { orgUid: newOrganizationId } });
    };

    // sync the organization store
    await datalayer.syncDataLayer(
      newOrganizationId,
      {
        registryId: newRegistryId,
        name,
        icon,
      },
      revertOrganizationIfFailed,
    );

    //sync the registry store
    await datalayer.syncDataLayer(
      newRegistryId,
      {
        [dataVersion]: registryVersionId,
      },
      revertOrganizationIfFailed,
    );

    await Organization.create({
      orgUid: newOrganizationId,
      registryId: registryVersionId,
      isHome: true,
      subscribed: true,
      name,
      icon,
    });

    return newOrganizationId;
  }

  // eslint-disable-next-line
  static appendNewRegistry = (dataVersion) => {
    throw new Error('Not implemented yet');
  };

  // eslint-disable-next-line
  static importOrganization = async (orgUid, ip, port) => {
    try {
      log('Subscribing to', orgUid, ip, port);
      const orgData = await datalayer.getSubscribedStoreData(orgUid, ip, port);

      log(orgData);

      if (!orgData.registryId) {
        throw new Error(
          'Currupted organization, no registryId on the datalayer, can not import',
        );
      }

      log('IMPORTING REGISTRY: ', orgData.registryId);

      const registryData = await datalayer.getSubscribedStoreData(
        orgData.registryId,
        ip,
        port,
      );

      if (!registryData.v1) {
        throw new Error('Organization has no registry, can not import');
      }

      log('IMPORTING REGISTRY V1: ', registryData.v1);

      await datalayer.subscribeToStoreOnDataLayer(registryData.v1, ip, port);

      log({
        orgUid,
        name: orgData.name,
        icon: orgData.icon,
        registryId: registryData.v1,
        subscribed: true,
        isHome: false,
      });

      await Organization.upsert({
        orgUid,
        name: orgData.name,
        icon: orgData.icon,
        registryId: registryData.v1,
        subscribed: true,
        isHome: false,
      });
    } catch (error) {
      log(error.message);
    }
  };

  // eslint-disable-next-line
  static subscribeToOrganization = async (orgUid) => {
    const exists = await Organization.findOne({ where: { orgUid } });
    if (exists) {
      await Organization.update({ subscribed: true }, { orgUid });
    } else {
      throw new Error(
        'Can not subscribe, please import this organization first',
      );
    }
  };

  // eslint-disable-next-line
  static unsubscribeToOrganization = async (orgUid) => {
    await Organization.update({ subscribed: false }, { orgUid });
  };

  static subscribeToDefaultOrganizations = async () => {
    try {
      const defaultOrgs = await getDefaultOrganizationList();
      if (!Array.isArray(defaultOrgs)) {
        log(
          'ERROR: Default Organization List Not found, This instance may be missing data from default orgs',
        );
      }

      await Promise.all(
        defaultOrgs.map(async (org) => {
          const exists = await Organization.findOne({
            where: { orgUid: org.orgUid },
          });

          if (!exists) {
            if (serverAvailable(org.ip, org.port)) {
              Organization.importOrganization(org.orgUid, org.ip, org.port);
            }
          }
        }),
      );
    } catch (error) {
      log(error);
    }
  };
}

Organization.init(ModelTypes, {
  sequelize,
  modelName: 'organization',
  timestamps: true,
});

export { Organization };