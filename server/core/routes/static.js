// Static Routes Module

import express from 'express';
import { downloadsPath, photosPath, recordingsPath } from '../database/path.js';
import { auth } from '../auth/index.js';

const setupStaticRoutes = (router) => {
    router.use('/downloads', auth, express.static(downloadsPath));
    router.use('/photos', auth, express.static(photosPath));
    router.use('/recordings', auth, express.static(recordingsPath));
};

const staticFiles = { setupStaticRoutes };

export default staticFiles;

export { setupStaticRoutes };
