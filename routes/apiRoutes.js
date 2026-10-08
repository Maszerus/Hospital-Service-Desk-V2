const { Router } = require("express");
const controller = require("../controllers/apiController");
const { requireSession } = require("../middleware/security");
const router = Router();

router.get("/session", controller.getSession);
router.post("/login", controller.login);
router.post("/logout", requireSession, controller.logout);
router.post("/lab/mode", requireSession, controller.changeLabMode);
router.get("/employees", requireSession, controller.searchEmployees);
router.get("/agents", requireSession, controller.listAgents);
router.get("/tickets", requireSession, controller.listTickets);
router.get("/tickets/:id", requireSession, controller.getTicket);
router.post("/tickets", requireSession, controller.createTicket);
router.patch(
  "/tickets/:id/status",
  requireSession,
  controller.changeTicketStatus,
);
router.post(
  "/tickets/:id/status",
  requireSession,
  controller.changeTicketStatus,
);
router.delete("/tickets/:id", requireSession, controller.deleteTicket);

module.exports = router;
