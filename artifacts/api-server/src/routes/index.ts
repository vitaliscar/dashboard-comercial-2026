import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import resumenRouter from "./resumen";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(resumenRouter);

export default router;
