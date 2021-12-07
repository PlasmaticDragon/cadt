'use strict';
import Sequelize from 'sequelize';
const { DataTypes, Model } = Sequelize;
import { sequelize } from '../database';

class Project extends Model {
  /**
   * Helper method for defining associations.
   * This method is not a part of Sequelize lifecycle.
   * The `models/index` file will call this method automatically.
   */
  static associate(models) {
    // define association here
  }
}

Project.init(
  {
    id: {
      type: Sequelize.NUMBER,
      primaryKey: true,
    },
    uuid: Sequelize.STRING,
    currentRegistry: Sequelize.STRING,
    registryOfOrigin: Sequelize.STRING,
    originProjectId: Sequelize.NUMBER,
    program: Sequelize.STRING,
    warehouseProjectId: Sequelize.NUMBER,
    projectName: Sequelize.STRING,
    projectLink: Sequelize.STRING,
    projectDeveloper: Sequelize.STRING,
    sector: Sequelize.STRING,
    projectType: Sequelize.STRING,
    coveredByNDC: Sequelize.STRING,
    NDCLinkage: Sequelize.STRING,
    projectStatus: Sequelize.STRING,
    projectStatusDate: Sequelize.DATE,
    unitMetric: Sequelize.STRING,
    methodology: Sequelize.STRING,
    methodologyVersion: Sequelize.STRING,
    validationApproach: Sequelize.STRING,
    validationDate: Sequelize.DATE,
    projectTag: Sequelize.STRING,
    estimatedAnnualAverageEmmisionReduction: Sequelize.STRING,
    owner: Sequelize.STRING,
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE,
  },
  { sequelize, modelName: 'Projects' },
);

export { Project };
