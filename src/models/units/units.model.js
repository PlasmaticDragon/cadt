'use strict';

import _ from 'lodash';
import Sequelize from 'sequelize';
import rxjs from 'rxjs';
import {
  sequelize,
  safeMirrorDbHandler,
  sanitizeSqliteFtsQuery,
} from '../database';
import { Qualification, Vintage } from '../../models';
import { UnitMirror } from './units.model.mirror';
import ModelTypes from './units.modeltypes.cjs';
import { changeListFactory } from '../../fullnode/data-layer-utils';

const { Model } = Sequelize;

const virtualFields = {
  unitBlockStart: {
    type: Sequelize.VIRTUAL,
    get() {
      const rawValue = this.getDataValue('serialNumberBlock');
      if (!rawValue) {
        return undefined;
      }
      return rawValue.split('-')[0];
    },
  },
  unitBlockEnd: {
    type: Sequelize.VIRTUAL,
    get() {
      const rawValue = this.getDataValue('serialNumberBlock');
      if (!rawValue) {
        return undefined;
      }
      return rawValue.split('-')[1];
    },
  },
  unitCount: {
    type: Sequelize.VIRTUAL,
    get() {
      const rawValue = this.getDataValue('serialNumberBlock');
      if (!rawValue) {
        return undefined;
      }
      const blocks = rawValue.split('-');
      const blockStart = Number(blocks[0].split(/(\d+)/)[1]);
      const blockEnd = Number(blocks[1].split(/(\d+)/)[1]);
      return blockEnd - blockStart;
    },
  },
};

class Unit extends Model {
  static stagingTableName = 'Units';
  static changes = new rxjs.Subject();

  static defaultColumns = Object.keys(
    Object.assign({}, ModelTypes, virtualFields),
  );

  static getAssociatedModels = () => [
    {
      model: Qualification,
      as: 'qualifications',
    },
    Vintage,
  ];

  static associate() {
    Unit.belongsTo(Vintage, {
      sourceKey: 'vintageId',
      foreignKey: 'vintageId',
    });

    // https://gist.github.com/elliette/20ddc4e827efd9d62bc98752e7a62610#some-important-addendums
    Unit.belongsToMany(Qualification, {
      foreignKey: 'warehouseUnitId',
      through: 'qualification_unit',
      as: 'qualifications',
    });

    safeMirrorDbHandler(() => {
      UnitMirror.belongsTo(Vintage, {
        sourceKey: 'vintageId',
        foreignKey: 'vintageId',
      });

      // https://gist.github.com/elliette/20ddc4e827efd9d62bc98752e7a62610#some-important-addendums
      UnitMirror.belongsToMany(Qualification, {
        foreignKey: 'warehouseUnitId',
        through: 'qualification_unit',
        as: 'qualifications',
      });
    });
  }

  static async create(values, options) {
    safeMirrorDbHandler(() => UnitMirror.create(values, options));

    const createResult = await super.create(values, options);
    const { orgUid } = createResult;

    Unit.changes.next(['units', orgUid]);

    return createResult;
  }

  static async destroy(values) {
    safeMirrorDbHandler(() => UnitMirror.destroy(values));

    const record = await super.findOne(values.where);
    const { orgUid } = record.dataValues;

    Unit.changes.next(['units', orgUid]);

    return super.destroy(values);
  }

  static async fts(searchStr, orgUid, pagination, columns = []) {
    const dialect = sequelize.getDialect();

    const handlerMap = {
      sqlite: Unit.findAllSqliteFts,
      mysql: Unit.findAllMySQLFts,
    };

    // Check if we need to include the virtual field dep
    for (const col of Object.keys(virtualFields)) {
      if (columns.includes(col)) {
        if (!columns.includes('serialNumberBlock')) {
          columns.push('serialNumberBlock');
        }
        break;
      }
    }

    return handlerMap[dialect](
      searchStr,
      orgUid,
      pagination,
      columns.filter(
        (col) =>
          ![
            'createdAt',
            'updatedAt',
            'unitBlockStart',
            'unitBlockEnd',
            'unitCount',
          ].includes(col),
      ),
    );
  }

  static async findAllMySQLFts(searchStr, orgUid, pagination, columns = []) {
    const { offset, limit } = pagination;

    let fields = '*';
    if (columns.length) {
      fields = columns.join(', ');
    }

    let sql = `
    SELECT ${fields} FROM units WHERE MATCH (
        unitOwnerOrgUid,
        countryJurisdictionOfOwner,
        inCountryJurisdictionOfOwner,
        serialNumberBlock,
        unitIdentifier,
        unitType,
        intendedBuyerOrgUid,
        marketplace,
        tags,
        unitStatus,
        unitTransactionType,
        unitStatusReason,
        tokenIssuanceHash,
        marketplaceIdentifier,
        unitsIssuanceLocation,
        unitRegistryLink,
        unitMarketplaceLink,
        cooresponingAdjustmentDeclaration,
        correspondingAdjustmentStatus
    ) AGAINST '":search"'
    `;

    if (orgUid) {
      sql = `${sql} AND orgUid = :orgUid`;
    }

    const replacements = { search: searchStr, orgUid };

    const count = (
      await sequelize.query(sql, {
        model: Unit,
        mapToModel: true, // pass true here if you have any mapped fields
        replacements,
      })
    ).length;

    if (limit && offset) {
      sql = `${sql} ORDER BY relevance DESC LIMIT :limit OFFSET :offset`;
    }

    return {
      count,
      rows: await sequelize.query(sql, {
        model: Unit,
        replacements: { ...replacements, ...{ offset, limit } },
        mapToModel: true, // pass true here if you have any mapped fields
        offset,
        limit,
      }),
    };
  }

  static async findAllSqliteFts(searchStr, orgUid, pagination, columns = []) {
    const { offset, limit } = pagination;

    let fields = '*';
    if (columns.length) {
      fields = columns.join(', ');
    }

    searchStr = sanitizeSqliteFtsQuery(searchStr);

    if (searchStr === '*') {
      // * isn't a valid matcher on its own. return empty set
      return {
        count: 0,
        rows: [],
      };
    }

    if (searchStr.startsWith('+')) {
      searchStr = searchStr.replace('+', ''); // If query starts with +, replace it
    }

    let sql = `SELECT ${fields} FROM units_fts WHERE units_fts MATCH :search`;

    if (orgUid) {
      sql = `${sql} AND orgUid = :orgUid`;
    }

    const replacements = { search: searchStr, orgUid };

    const count = (
      await sequelize.query(sql, {
        model: Unit,
        mapToModel: true, // pass true here if you have any mapped fields
        replacements,
      })
    ).length;

    if (limit && offset) {
      sql = `${sql} ORDER BY rank DESC LIMIT :limit OFFSET :offset`;
    }

    return {
      count,
      rows: await sequelize.query(sql, {
        model: Unit,
        mapToModel: true, // pass true here if you have any mapped fields
        replacements: { ...replacements, ...{ offset, limit } },
      }),
    };
  }

  static async generateChangeListFromStagedData(
    action,
    warehouseUnitId,
    stagedData,
  ) {
    const foreignKeys = ['qualifications', 'vintage'];
    if (_.get(stagedData, 'vintage.id')) {
      stagedData.vintageId = stagedData.vintage.id;
    }

    return Promise.resolve(
      changeListFactory(
        action,
        warehouseUnitId,
        _.omit(stagedData, foreignKeys),
      ),
    );
  }

  static generateUnitModelChangeListFromStagedRecord(action, uuid, data) {
    const promises = [
      Unit.generateChangeListFromStagedData(action, uuid, data),
    ];

    if (data.vintage) {
      promises.push(
        Vintage.generateChangeListFromStagedData(action, uuid, [data.vintage]),
      );
    }

    if (data.qualifications) {
      promises.push(
        Qualification.generateChangeListFromStagedData(
          action,
          uuid,
          data.qualifications,
        ),
      );
    }

    return Promise.all(promises);
  }
}

Unit.init(Object.assign({}, ModelTypes, virtualFields), {
  sequelize,
  modelName: 'unit',
});

export { Unit };
