import '@/styles.css'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { useAppForm, submitForm } from '@/components/form/app-form'

function FailingForm() {
  const form = useAppForm({
    defaultValues: { name: '' },
    onSubmit: ({ formApi, value }) =>
      submitForm(formApi, async () => {
        if (value.name !== 'Retry') throw new Error('Try again')
      }),
  })

  return (
    <form.AppForm>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        <div role="alert">
          <form.FormError />
        </div>
        <form.SubmitButton label="Save" pendingLabel="Saving" />
      </form>
    </form.AppForm>
  )
}

afterEach(cleanup)

it('shows a server submit failure and lets a corrected form retry', async () => {
  render(<FailingForm />)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Try again')
  await page.getByRole('textbox', { name: 'Name' }).fill('Retry')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.element(page.getByRole('alert')).not.toHaveTextContent('Try again')
})
