import express from 'express'
import prisma from '../prismaClient.js'

const router = express.Router()

// Get all expenses for logged-in user
router.get('/', async(req, res) => {
    const expenses = await prisma.expense.findMany({
        where :{
            userId : req.userId
        }
    })
    res.json(expenses)
})

// Create a new expense
router.post('/', async (req, res) => {
    const { title, amount } = req.body
    const expense = await prisma.expense.create({
        data : {
            title,
            amount : parseFloat(amount),
            userId : req.userId
        }
    })

    res.json(expense )
})

// Delete an expense
router.delete('/:id', async(req, res) => {
    const { id } = req.params
    await prisma.expense.deleteMany({
        where :{
            id : parseInt(id),
            userId : req.userId
        }
    })

    res.send({ message: "Expense deleted" })
})

export default router
