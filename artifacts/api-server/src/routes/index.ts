import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import resumenRouter from "./resumen";
import unidadesRouter from "./unidades";
import cobranzasRouter from "./cobranzas";
import asesoresRouter from "./asesores";
import minutasRouter from "./minutas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(resumenRouter);
router.use(unidadesRouter);
router.use(cobranzasRouter);
router.use(asesoresRouter);
router.use(minutasRouter);

export default router;
