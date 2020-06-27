import csvParse from 'csv-parse';
import fs from 'fs';
import { getRepository, In } from 'typeorm';
import Transaction from '../models/Transaction';
import Category from '../models/Category';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const categoriesRepository = getRepository(Category);
    const transactionsRepository = getRepository(Transaction);
    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      from_line: 2, // a linha 1 são os cabeçalhos, não queremos ler
    });

    const parseCSV = contactsReadStream.pipe(parsers); // Ler as linhas do CSV conforme disponível

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);

      transactions.push({ title, type, value, category });
    });
    // .on('end', () => {
    //   console.log(transactions);
    //   resolve;
    // }),

    await new Promise(resolve => parseCSV.on('end', resolve));

    // Verificar se as categorias já existem no banco de dados
    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    const newCategoryTitles = categories
      .filter(
        (categoryTitle: string) =>
          !existentCategoriesTitles.includes(categoryTitle),
      )
      .filter((value, index, self) => self.indexOf(value) === index); // self é a lista de categorias do primeiro filter

    const newCategories = categoriesRepository.create(
      newCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    const newTransactions = transactionsRepository.create(
      transactions.map(transaction => {
        return {
          title: transaction.title,
          type: transaction.type,
          value: transaction.value,
          category: finalCategories.find(
            category => category.title === transaction.category,
          ),
        };
      }),
    );

    await transactionsRepository.save(newTransactions);

    await fs.promises.unlink(filePath); // Excluir o arquivo CSV

    return newTransactions;
  }
}

export default ImportTransactionsService;
