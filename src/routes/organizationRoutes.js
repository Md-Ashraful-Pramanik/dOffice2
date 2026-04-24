const express = require('express');
const {
  listOrganizations,
  getOrganizationTree,
  getOrganization,
  createOrganization,
  createSubOrganization,
  updateOrganization,
  moveOrganization,
  mergeOrganizations,
  cloneOrganization,
  archiveOrganization,
  restoreOrganization,
  deleteOrganization,
  listRelationships,
  createRelationship,
  deleteRelationship
} = require('../controllers/organizationController');

const router = express.Router();

router.get('/', listOrganizations);
router.get('/tree', getOrganizationTree);
router.post('/', createOrganization);
router.post('/merge', mergeOrganizations);

router.get('/:orgId', getOrganization);
router.put('/:orgId', updateOrganization);
router.post('/:orgId/children', createSubOrganization);
router.post('/:orgId/move', moveOrganization);
router.post('/:orgId/clone', cloneOrganization);
router.post('/:orgId/archive', archiveOrganization);
router.post('/:orgId/restore', restoreOrganization);
router.delete('/:orgId', deleteOrganization);

router.get('/:orgId/relationships', listRelationships);
router.post('/:orgId/relationships', createRelationship);
router.delete('/:orgId/relationships/:relationshipId', deleteRelationship);

module.exports = router;
