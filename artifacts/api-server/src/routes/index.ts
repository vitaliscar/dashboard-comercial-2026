import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import resumenRouter from "./resumen";
import unidadesRouter from "./unidades";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(resumenRouter);
router.use(unidadesRouter);

export default router;
