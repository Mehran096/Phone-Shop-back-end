const asyncHandler = require ('express-async-handler')
const Contact = require ('../models/contactModel.js')

const createContact = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body
  
  const contact = new Contact({ name, email, subject, message })
  const createdContact = await contact.save()
  res.status(201).json(createdContact)
})
module.exports = { createContact}

 