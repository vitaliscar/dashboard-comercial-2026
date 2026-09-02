import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import resumenRouter from "./resumen";
import unidadesRouter from "./unidades";
import cobranzasRouter from "./cobranzas";
import asesoresRouter from "./asesores";
import minutasRouter from "./minutas";
import administracionRouter from "./administracion";
import alertasRouter from "./alertas";
import cliente360Router from "./cliente-360";
import embudoRouter from "./embudo";
import panelesRouter from "./paneles";
import evaluacionRouter from "./evaluacion";
import { currentSession, withScopedTransaction } from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(resumenRouter);
router.use(unidadesRouter);
router.use(cobranzasRouter);
router.use(asesoresRouter);
router.use(minutasRouter);
router.use(administracionRouter(currentSession, withScopedTransaction));
router.use(alertasRouter);
router.use(cliente360Router);
router.use(embudoRouter);
router.use(panelesRouter);
router.use(evaluacionRouter);

export default router;
