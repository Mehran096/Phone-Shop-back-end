const express =require ('express')
const router = express.Router()
const { createContact } = require ('../controllers/contactController.js')

router.route('/').post(createContact)
module.exports = router